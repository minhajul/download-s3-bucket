## Download S3 Bucket

A simple node.js app to download s3 bucket data and make it zip.

### 🚀 Quick Start

Clone the project and follow the steps below to run the application.

### 1. Install Dependencies
```npm install```

### 2. Configure AWS account

Run this ```cp .env.example .env``` command to create a ```.env``` file with the example from ```.env.example```:

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
```

### 3. Start Downloading

Run the below command to start the downloading.

```npm run start```

After starting the application, you'll be prompted to enter the bucket name. Once provided, the app will begin downloading files from that specified S3 bucket.

### Made with ❤️ by [[minhajul](https://github.com/minhajul)]