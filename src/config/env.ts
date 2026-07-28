import 'dotenv/config';
const required = ['DATABASE_URL', 'JWT_SECRET'] as const;
for (const key of required)
  if (!process.env[key])
    throw new Error(`Missing required environment variable: ${key}`);
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? '*',
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',
  awsRegion: process.env.AWS_REGION ?? 'ap-south-1',
  awsBucket: process.env.AWS_S3_BUCKET,
};
