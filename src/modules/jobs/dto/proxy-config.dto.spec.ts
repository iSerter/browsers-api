import { validate } from 'class-validator';
import { ProxyConfigDto } from './proxy-config.dto';

describe('ProxyConfigDto', () => {
  it('should be defined', () => {
    expect(ProxyConfigDto).toBeDefined();
  });

  describe('validation', () => {
    it('should pass validation with valid proxy server URL', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'http://proxy.example.com:8080';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with https proxy server URL', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'https://proxy.example.com:8080';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with username and password', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'http://proxy.example.com:8080';
      dto.username = 'user';
      dto.password = 'pass';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation without server', async () => {
      const dto = new ProxyConfigDto();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('server');
    });

    it('should fail validation with invalid URL', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'not-a-valid-url';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('server');
    });

    it('should fail validation with URL without protocol', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'proxy.example.com:8080';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('server');
    });

    it('should pass validation with only username (password optional)', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'http://proxy.example.com:8080';
      dto.username = 'user';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with only password (username optional)', async () => {
      const dto = new ProxyConfigDto();
      dto.server = 'http://proxy.example.com:8080';
      dto.password = 'pass';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});

