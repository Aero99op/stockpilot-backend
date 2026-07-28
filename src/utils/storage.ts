import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
export async function storeImage(file: Express.Multer.File): Promise<string> {
  const key = `products/${crypto.randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (env.storageDriver === 's3') {
    if (!env.awsBucket)
      throw new AppError(500, 'AWS_S3_BUCKET is required for S3 storage');
    const client = new S3Client({ region: env.awsRegion });
    await client.send(
      new PutObjectCommand({
        Bucket: env.awsBucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return `https://${env.awsBucket}.s3.${env.awsRegion}.amazonaws.com/${key}`;
  }
  await mkdir(env.localUploadDir, { recursive: true });
  const name = key.replace('products/', '');
  await writeFile(join(env.localUploadDir, name), file.buffer);
  return `${env.publicBaseUrl}/uploads/${name}`;
}
