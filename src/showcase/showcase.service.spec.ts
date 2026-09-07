import { Test, TestingModule } from '@nestjs/testing';
import { ShowcaseService } from './showcase.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { BadRequestException } from '@nestjs/common';

describe('ShowcaseService (Album Management)', () => {
  let service: ShowcaseService;
  let prisma: any;
  let cloudinary: any;

  beforeEach(async () => {
    prisma = {
      showcaseAlbum: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      showcaseImage: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    cloudinary = {
      uploadImageBuffer: jest.fn().mockResolvedValue({
        url: 'https://cloudinary.com/test.jpg',
        publicId: 'test-id',
      }),
      deleteImage: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShowcaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();

    service = module.get<ShowcaseService>(ShowcaseService);
  });

  describe('createAlbum', () => {
    it('should reject if title is empty', async () => {
      await expect(service.createAlbum('', [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if no files provided', async () => {
      await expect(service.createAlbum('Album 1', [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if more than 20 files provided', async () => {
      const twentyOneFiles = Array(21).fill({
        originalname: 'test.jpg',
        size: 1024,
        mimetype: 'image/jpeg',
        buffer: Buffer.from('test'),
      }) as any[];

      await expect(
        service.createAlbum('Album 1', twentyOneFiles),
      ).rejects.toThrow(/tối đa 20 ảnh/);
    });

    it('should reject if a compressed file is not under 1.5MB', async () => {
      const oversizeFile = [
        {
          originalname: 'big.jpg',
          size: 1.6 * 1024 * 1024,
          mimetype: 'image/jpeg',
          buffer: Buffer.from('oversize'),
        },
      ] as any[];

      await expect(
        service.createAlbum('Album 1', oversizeFile),
      ).rejects.toThrow(/chưa được nén xuống dưới 1,5 MB/);
    });

    it('should successfully create an album with <= 20 valid images', async () => {
      const validFiles = [
        {
          originalname: 'img1.jpg',
          size: 1.4 * 1024 * 1024,
          mimetype: 'image/jpeg',
          buffer: Buffer.from('test1'),
        },
        {
          originalname: 'img2.png',
          size: 1.2 * 1024 * 1024,
          mimetype: 'image/png',
          buffer: Buffer.from('test2'),
        },
      ] as any[];

      prisma.showcaseAlbum.create.mockResolvedValue({
        id: 'album-1',
        title: 'Album Cưới Studio',
        order: 0,
        isActive: true,
        images: [
          {
            url: 'https://cloudinary.com/test.jpg',
            title: 'Album Cưới Studio #1',
            order: 0,
          },
          {
            url: 'https://cloudinary.com/test.jpg',
            title: 'Album Cưới Studio #2',
            order: 1,
          },
        ],
      });

      const result = await service.createAlbum('Album Cưới Studio', validFiles);

      expect(cloudinary.uploadImageBuffer).toHaveBeenCalledTimes(2);
      expect(prisma.showcaseAlbum.create).toHaveBeenCalled();
      expect(result.id).toBe('album-1');
      expect(result.images.length).toBe(2);
    });
  });

  describe('getActiveShowcase (Client Slide)', () => {
    it('should return flattened photos from active albums', async () => {
      prisma.showcaseAlbum.findMany.mockResolvedValue([
        {
          id: 'album-1',
          title: 'Album 1',
          order: 0,
          isActive: true,
          images: [
            { id: 'p1', url: 'https://cdn.com/1.jpg', order: 0 },
            { id: 'p2', url: 'https://cdn.com/2.jpg', order: 1 },
          ],
        },
      ]);

      const activeShowcase = await service.getActiveShowcase();

      expect(activeShowcase).toHaveLength(2);
      expect(activeShowcase[0].url).toBe('https://cdn.com/1.jpg');
      expect(activeShowcase[1].url).toBe('https://cdn.com/2.jpg');
    });
  });

  describe('deleteAlbum', () => {
    it('should delete all photos in album from Cloudinary and remove album from DB', async () => {
      prisma.showcaseAlbum.findUnique.mockResolvedValue({
        id: 'album-1',
        title: 'Album 1',
        images: [
          { publicId: 'cloud-1', url: '...' },
          { publicId: 'cloud-2', url: '...' },
        ],
      });
      prisma.showcaseAlbum.delete.mockResolvedValue({});

      await service.deleteAlbum('album-1');

      expect(cloudinary.deleteImage).toHaveBeenCalledWith('cloud-1');
      expect(cloudinary.deleteImage).toHaveBeenCalledWith('cloud-2');
      expect(prisma.showcaseAlbum.delete).toHaveBeenCalledWith({
        where: { id: 'album-1' },
      });
    });
  });
});
