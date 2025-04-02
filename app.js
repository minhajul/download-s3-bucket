import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import archiver from "archiver";
import "dotenv/config";

// AWS S3 Configuration
const BUCKET_NAME = "your-bucket-name";
const REGION = process.env.AWS_REGION;
const DOWNLOAD_PATH = path.join(os.homedir(), "Downloads", "s3-bucket"); // Mac's Downloads folder
const ZIP_FILE_PATH = path.join(os.homedir(), "Downloads", "s3-bucket.zip"); // Final ZIP file location

// Initialize S3 Client
const s3 = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// Helper function to download an S3 object to a local file
const downloadFile = async (fileKey, filePath) => {
    if (fileKey.endsWith("/")) {
        // If it's a directory (S3 prefix), just create it locally
        fs.mkdirSync(filePath, { recursive: true });
        return;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const getObjectParams = { Bucket: BUCKET_NAME, Key: fileKey };
    const { Body } = await s3.send(new GetObjectCommand(getObjectParams));

    return promisify(fs.writeFile)(filePath, await Body.transformToByteArray());
};

// Function to list and download all objects from the bucket
const downloadBucket = async () => {
    let continuationToken = null;
    let downloadedFiles = [];

    console.log("Starting download...");
    do {
        const listParams = { Bucket: BUCKET_NAME, ContinuationToken: continuationToken };
        const data = await s3.send(new ListObjectsV2Command(listParams));
        if (!data.Contents) {
            console.log("No files found in the bucket.");
            return [];
        }

        for (const file of data.Contents) {
            const filePath = path.join(DOWNLOAD_PATH, file.Key);
            await downloadFile(file.Key, filePath);
            if (!file.Key.endsWith("/")) downloadedFiles.push(filePath); // Only add files, not directories
            console.log(`Downloaded: ${file.Key}`);
        }

        continuationToken = data.NextContinuationToken;
    } while (continuationToken);

    console.log("Download complete.");
    return downloadedFiles;
};

// Function to zip all downloaded files
const zipFiles = async (files) => {
    console.log("Creating ZIP file...");
    const output = fs.createWriteStream(ZIP_FILE_PATH);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(DOWNLOAD_PATH, false); // Zip the entire folder instead of individual files
    await archive.finalize();

    console.log(`ZIP file created: ${ZIP_FILE_PATH}`);
};

// Main function to download, zip, and cleanup
const main = async () => {
    try {
        const files = await downloadBucket();
        if (files.length > 0) {
            await zipFiles(files);
            console.log("Process complete!");
        } else {
            console.log("No files to zip.");
        }
    } catch (error) {
        console.error("Error:", error);
    }
};

main();