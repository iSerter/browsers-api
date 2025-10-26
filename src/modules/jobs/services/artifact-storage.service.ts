import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobArtifact, ArtifactType } from '../entities/job-artifact.entity';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ArtifactStorageService {
  private readonly logger = new Logger(ArtifactStorageService.name);
  private readonly artifactsBaseDir: string;

  constructor(
    @InjectRepository(JobArtifact)
    private readonly artifactRepository: Repository<JobArtifact>,
    private readonly configService: ConfigService,
  ) {
    // Get artifacts directory from config or use default
    this.artifactsBaseDir =
      configService.get<string>('ARTIFACTS_DIR') ||
      path.join(process.cwd(), 'artifacts');
  }

  async saveArtifact(
    buffer: Buffer,
    jobId: string,
    filename: string,
    artifactType: ArtifactType,
    mimeType: string,
  ): Promise<string> {
    // Create job-specific directory
    const jobDir = path.join(this.artifactsBaseDir, jobId);

    try {
      // Ensure directory exists
      await fs.mkdir(jobDir, { recursive: true });

      const filePath = path.join(jobDir, filename);
      const sizeBytes = buffer.length;

      // Save file to filesystem
      await fs.writeFile(filePath, buffer);

      this.logger.debug(
        `Saved artifact: ${filePath} (${sizeBytes} bytes, mime: ${mimeType})`,
      );

      // Create database record
      const artifact = this.artifactRepository.create({
        jobId,
        artifactType,
        filePath,
        fileData: buffer,
        mimeType,
        sizeBytes,
      });

      const savedArtifact = await this.artifactRepository.save(artifact);

      this.logger.log(
        `Created artifact record with ID ${savedArtifact.id} for job ${jobId}`,
      );

      return filePath;
    } catch (error) {
      this.logger.error(
        `Failed to save artifact for job ${jobId}: ${error.message}`,
      );
      throw error;
    }
  }

  async getArtifact(artifactId: string): Promise<JobArtifact | null> {
    return this.artifactRepository.findOne({
      where: { id: artifactId },
    });
  }

  async deleteArtifact(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Deleted artifact file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete artifact file: ${error.message}`);
    }
  }

  async cleanupJobArtifacts(jobId: string): Promise<void> {
    try {
      const artifacts = await this.artifactRepository.find({
        where: { jobId },
      });

      // Delete files
      for (const artifact of artifacts) {
        if (artifact.filePath) {
          await this.deleteArtifact(artifact.filePath);
        }
      }

      // Delete database records
      await this.artifactRepository.remove(artifacts);

      // Remove job directory
      const jobDir = path.join(this.artifactsBaseDir, jobId);
      try {
        await fs.rmdir(jobDir, { recursive: true });
        this.logger.debug(`Removed job artifacts directory: ${jobDir}`);
      } catch (error) {
        this.logger.warn(`Failed to remove job directory: ${error.message}`);
      }

      this.logger.log(
        `Cleaned up ${artifacts.length} artifacts for job ${jobId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup artifacts for job ${jobId}: ${error.message}`,
      );
      throw error;
    }
  }
}
