import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import os from "os";
import archiver from "archiver";
import "dotenv/config";
import readline from "readline";
import fse from "fs-extra";
import pLimit from "p-limit";
import pino from "pino";

const CONFIG = {
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    DOWNLOAD_PATH: process.env.DOWNLOAD_PATH || path.join(os.homedir(), "Downloads", "s3-bucket"),
    ZIP_FILE_PATH: process.env.ZIP_FILE_PATH || path.join(os.homedir(), "Downloads", "s3-bucket.zip"),
    LOG_FILE_PATH: process.env.LOG_FILE_PATH || path.join(os.homedir(), "Downloads", "s3-bucket.log"),
    CONCURRENCY_LIMIT: parseInt(process.env.CONCURRENCY_LIMIT, 10) || 10,
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
    RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS, 10) || 1000,
};

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "production"
        ? undefined
        : {
              targets: [
                  { target: "pino-pretty", options: { colorize: true }, level: "info" },
              ],
          },
}, pino.destination(CONFIG.LOG_FILE_PATH));

const validateEnv = () => {
    const required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}. Please check your .env file.`);
    }
};

const initS3Client = () => {
    validateEnv();
    return new S3Client({
        region: CONFIG.AWS_REGION,
        credentials: {
            accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
            secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY,
        },
    });
};

const s3 = initS3Client();

const askBucketName = () => {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question("Enter S3 Bucket Name: ", (bucketName) => {
            rl.close();
            const trimmed = bucketName.trim();

            if (!trimmed) {
                reject(new Error("Bucket name cannot be empty."));
                return;
            }

            resolve(trimmed);
        });
    });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryWithBackoff = async (fn, retries = CONFIG.MAX_RETRIES, delay = CONFIG.RETRY_DELAY_MS) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            const backoffDelay = delay * Math.pow(2, attempt - 1);
            logger.warn({ attempt, nextDelay: backoffDelay, error: error.message }, "Retrying after failure");
            await sleep(backoffDelay);
        }
    }
};

const downloadFile = async (bucketName, fileKey) => {
    const filePath = path.join(CONFIG.DOWNLOAD_PATH, fileKey);

    // Handle directory markers (keys ending with /)
    if (fileKey.endsWith("/")) {
        await fse.ensureDir(filePath);
        return { success: true, fileKey };
    }

    await fse.ensureDir(path.dirname(filePath));

    const downloadFn = async () => {
        const getObjectParams = { Bucket: bucketName, Key: fileKey };
        const { Body } = await s3.send(new GetObjectCommand(getObjectParams));
        const buffer = await Body.transformToByteArray();
        await fse.writeFile(filePath, Buffer.from(buffer));
    };

    try {
        await retryWithBackoff(downloadFn);
        return { success: true, fileKey, filePath };
    } catch (error) {
        return { success: false, fileKey, error: error.message };
    }
};

const downloadBucket = async (bucketName) => {
    let continuationToken = null;
    const downloadedFiles = [];
    const failedFiles = [];
    let totalFiles = 0;
    let processedFiles = 0;

    logger.info({ bucket: bucketName }, "Starting download");

    // Single pass: list and download with progress
    do {
        const listParams = { Bucket: bucketName, ContinuationToken: continuationToken };
        const data = await s3.send(new ListObjectsV2Command(listParams));

        if (!data.Contents || data.Contents.length === 0) {
            if (!continuationToken) {
                logger.warn("No files found in the bucket");
                return { downloaded: [], failed: [] };
            }
            break;
        }

        // Filter out directory markers for counting
        const files = data.Contents.filter((f) => !f.Key.endsWith("/"));
        totalFiles += files.length;

        // Also create directories for folder keys
        const folders = data.Contents.filter((f) => f.Key.endsWith("/"));
        for (const folder of folders) {
            const folderPath = path.join(CONFIG.DOWNLOAD_PATH, folder.Key);
            await fse.ensureDir(folderPath);
        }

        // Download files with concurrency control
        const limit = pLimit(CONFIG.CONCURRENCY_LIMIT);
        const downloadPromises = files.map((file) =>
            limit(async () => {
                processedFiles++;
                const result = await downloadFile(bucketName, file.Key);

                if (result.success) {
                    downloadedFiles.push(result.filePath);
                    logger.info({ progress: `${processedFiles}/${totalFiles}`, file: file.Key }, "Downloaded");
                } else {
                    failedFiles.push({ fileKey: file.Key, error: result.error });
                    logger.error({ progress: `${processedFiles}/${totalFiles}`, file: file.Key, error: result.error }, "Failed to download");
                }

                // Print progress to console
                process.stdout.write(`\r[${processedFiles}/${totalFiles}] Downloaded: ${downloadedFiles.length} | Failed: ${failedFiles.length}`);
            })
        );

        await Promise.all(downloadPromises);
        continuationToken = data.NextContinuationToken;
    } while (continuationToken);

    console.log("\n"); // New line after progress
    logger.info({ downloaded: downloadedFiles.length, failed: failedFiles.length }, "Download complete");

    return { downloaded: downloadedFiles, failed: failedFiles, total: totalFiles };
};

const zipFiles = async () => {
    logger.info({ path: CONFIG.DOWNLOAD_PATH, output: CONFIG.ZIP_FILE_PATH }, "Creating ZIP file");

    return new Promise((resolve, reject) => {
        const output = fse.createWriteStream(CONFIG.ZIP_FILE_PATH);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
            logger.info({ size: `${sizeMB} MB`, path: CONFIG.ZIP_FILE_PATH }, "ZIP file created");
            resolve(CONFIG.ZIP_FILE_PATH);
        });

        archive.on("error", (err) => {
            logger.error({ error: err.message }, "Archive error");
            reject(err);
        });

        archive.pipe(output);
        archive.directory(CONFIG.DOWNLOAD_PATH, false);
        archive.finalize();
    });
};

const cleanupDownloadedFiles = async () => {
    try {
        const exists = await fse.pathExists(CONFIG.DOWNLOAD_PATH);
        if (exists) {
            logger.info({ path: CONFIG.DOWNLOAD_PATH }, "Cleaning up downloaded files");
            await fse.remove(CONFIG.DOWNLOAD_PATH);
            logger.info("Cleanup complete");
        }
    } catch (error) {
        logger.warn({ error: error.message }, "Cleanup warning");
    }
};

const cleanupZipFile = async () => {
    try {
        const exists = await fse.pathExists(CONFIG.ZIP_FILE_PATH);
        if (exists) {
            await fse.remove(CONFIG.ZIP_FILE_PATH);
            logger.info({ path: CONFIG.ZIP_FILE_PATH }, "Removed existing ZIP file");
        }
    } catch (error) {
        logger.warn({ error: error.message }, "ZIP cleanup warning");
    }
};

const main = async () => {
    try {
        logger.info("Application started");

        await cleanupZipFile();
        await cleanupDownloadedFiles();

        const bucketName = await askBucketName();
        const { downloaded, failed, total } = await downloadBucket(bucketName);

        if (total === 0) {
            logger.info("No files to process");
            console.log("No files found in the bucket.");
            return;
        }

        if (downloaded.length > 0) {
            await zipFiles();
            await cleanupDownloadedFiles();
            console.log(`\nProcess complete! ZIP saved to: ${CONFIG.ZIP_FILE_PATH}`);
        } else {
            console.log("\nNo files were downloaded successfully.");
        }

        if (failed.length > 0) {
            console.log("\nFailed files:");
            failed.forEach((f) => console.log(`  - ${f.fileKey}: ${f.error}`));
            logger.warn({ failedCount: failed.length, files: failed.map(f => f.fileKey) }, "Some files failed to download");
        }

        logger.info("Application finished");
    } catch (error) {
        logger.fatal({ error: error.message, stack: error.stack }, "Fatal error");
        console.error("Error:", error.message);
        process.exit(1);
    }
};

main();