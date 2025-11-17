import { ArtifactType } from './job-artifact.entity';

describe('ArtifactType Enum', () => {
  describe('SNAPSHOT type', () => {
    it('should have SNAPSHOT enum value defined', () => {
      expect(ArtifactType.SNAPSHOT).toBeDefined();
      expect(ArtifactType.SNAPSHOT).toBe('snapshot');
    });

    it('should be accessible and usable in type annotations', () => {
      const snapshotType: ArtifactType = ArtifactType.SNAPSHOT;
      expect(snapshotType).toBe('snapshot');
    });

    it('should be included in all ArtifactType values', () => {
      const allTypes = Object.values(ArtifactType);
      expect(allTypes).toContain('snapshot');
      expect(allTypes).toContain(ArtifactType.SNAPSHOT);
    });
  });

  describe('All ArtifactType values', () => {
    it('should include all expected artifact types', () => {
      const expectedTypes = [
        'screenshot',
        'pdf',
        'video',
        'trace',
        'data',
        'snapshot',
      ];
      const actualTypes = Object.values(ArtifactType);
      expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
      expect(actualTypes.length).toBe(expectedTypes.length);
    });
  });
});

