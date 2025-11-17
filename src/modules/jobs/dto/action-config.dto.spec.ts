import 'reflect-metadata';
import {
  ActionType,
  ActionConfigDto,
  SnapshotConfigDto,
} from './action-config.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('ActionType Enum', () => {
  describe('SNAPSHOT type', () => {
    it('should have SNAPSHOT enum value defined', () => {
      expect(ActionType.SNAPSHOT).toBeDefined();
      expect(ActionType.SNAPSHOT).toBe('snapshot');
    });

    it('should be accessible and usable in type annotations', () => {
      const snapshotType: ActionType = ActionType.SNAPSHOT;
      expect(snapshotType).toBe('snapshot');
    });

    it('should be included in all ActionType values', () => {
      const allTypes = Object.values(ActionType);
      expect(allTypes).toContain('snapshot');
      expect(allTypes).toContain(ActionType.SNAPSHOT);
    });
  });

  describe('All ActionType values', () => {
    it('should include all expected action types', () => {
      const expectedTypes = [
        'click',
        'fill',
        'scroll',
        'moveCursor',
        'screenshot',
        'visit',
        'extract',
        'pdf',
        'snapshot',
      ];
      const actualTypes = Object.values(ActionType);
      expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
      expect(actualTypes.length).toBe(expectedTypes.length);
    });
  });
});

describe('ActionConfigDto', () => {
  describe('SNAPSHOT action validation', () => {
    it('should accept SNAPSHOT as a valid action type', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: ActionType.SNAPSHOT,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept SNAPSHOT action with optional fields', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: ActionType.SNAPSHOT,
        target: 'some-selector',
        getTargetBy: 'getBySelector',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid action type', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: 'invalid-action',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('action');
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });

    it('should serialize and deserialize SNAPSHOT action correctly', () => {
      const config: ActionConfigDto = {
        action: ActionType.SNAPSHOT,
        target: 'body',
      };

      const serialized = JSON.stringify(config);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.action).toBe('snapshot');
      expect(deserialized.target).toBe('body');
    });

    it('should accept SNAPSHOT action with snapshotConfig', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: ActionType.SNAPSHOT,
        snapshotConfig: {
          cookies: true,
          localStorage: true,
          sessionStorage: false,
        },
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.snapshotConfig?.cookies).toBe(true);
      expect(dto.snapshotConfig?.localStorage).toBe(true);
      expect(dto.snapshotConfig?.sessionStorage).toBe(false);
    });

    it('should accept SNAPSHOT action without snapshotConfig (optional)', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: ActionType.SNAPSHOT,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.snapshotConfig).toBeUndefined();
    });

    it('should reject invalid snapshotConfig values', async () => {
      const dto = plainToInstance(ActionConfigDto, {
        action: ActionType.SNAPSHOT,
        snapshotConfig: {
          cookies: 'not-a-boolean',
          localStorage: true,
        },
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const snapshotConfigErrors = errors.find(
        (e) => e.property === 'snapshotConfig',
      );
      expect(snapshotConfigErrors).toBeDefined();
    });
  });
});

describe('SnapshotConfigDto', () => {
  describe('Field validation', () => {
    it('should accept all boolean fields when provided', async () => {
      const dto = plainToInstance(SnapshotConfigDto, {
        cookies: true,
        localStorage: false,
        sessionStorage: true,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.cookies).toBe(true);
      expect(dto.localStorage).toBe(false);
      expect(dto.sessionStorage).toBe(true);
    });

    it('should accept empty object (all fields optional)', async () => {
      const dto = plainToInstance(SnapshotConfigDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid types for cookies field', async () => {
      const dto = plainToInstance(SnapshotConfigDto, {
        cookies: 'not-a-boolean',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('cookies');
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });

    it('should reject invalid types for localStorage field', async () => {
      const dto = plainToInstance(SnapshotConfigDto, {
        localStorage: 123,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('localStorage');
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });

    it('should reject invalid types for sessionStorage field', async () => {
      const dto = plainToInstance(SnapshotConfigDto, {
        sessionStorage: 'invalid',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('sessionStorage');
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });
  });
});

