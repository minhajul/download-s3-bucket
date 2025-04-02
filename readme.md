## Download S3 Bucket

A simple node.js app to download s3 bucket data and make it zip.

### Quick Start

Clone the project and follow the steps below to run the application.

#### Configure AWS account
Run this ```cp .env.example .env``` command to create a ```.env``` file with the example from ```.env.example```:

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
```

Also specify your ```bucket``` name in ```app.js``` file.

```const BUCKET_NAME = "your-bucket-name"```

#### Start Downloading

Run below command to start the downloading.

```node app.js```