## Download S3 Bucket

A Node.js CLI tool to download files from an S3 bucket, zip them, and clean up automatically.

### Features

- **Parallel Downloads** - Downloads multiple files concurrently for faster performance
- **Retry with Backoff** - Automatically retries failed downloads (up to 3 attempts)
- **Progress Tracking** - Real-time progress display during download
- **Configurable** - Fully configurable via environment variables

### Quick Start

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure AWS Account

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials:

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

#### 3. Run

```bash
npm start
```

Enter your S3 bucket name when prompted. The app will download all files, create a ZIP, and clean up the temporary
files.

### Configuration

All settings are optional. Defaults work out of the box.

| Variable                | Default                    | Description                       |
|-------------------------|----------------------------|-----------------------------------|
| `AWS_ACCESS_KEY_ID`     | (required)                 | AWS access key                    |
| `AWS_SECRET_ACCESS_KEY` | (required)                 | AWS secret key                    |
| `AWS_REGION`            | (required)                 | AWS region                        |
| `DOWNLOAD_PATH`         | ~/Downloads/s3-bucket      | Download location                 |
| `ZIP_FILE_ PATH`        | ~/Downloads/s3-bucket. zip | ZIP output path                   |
| `CONCURRENCY_LIMIT`     | 10                         | Max parallel downloads            |
| `MAX_RETRIES`           | 3                          | Retry attempts per file           |
| `RETRY_DELAY_MS`        | 1,000                      | Base delay for retry backoff (ms) |

### Output

- Downloaded files: `~/Downloads/s3-bucket/`
- ZIP file: `~/Downloads/s3-bucket. zip`

After completion, downloaded files are automatically cleaned up, leaving only the ZIP.

### Made with ❤️ by [minhajul](https://github.com/minhajul)
