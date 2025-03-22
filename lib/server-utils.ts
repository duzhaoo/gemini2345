import { ImageMetadata, ImageOptions } from './types';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uploadImageToFeishu, saveImageRecord } from './feishu';

// Create images directory if it doesn't exist
const imagesDir = path.join(process.cwd(), "public", "generated-images");
const metadataDir = path.join(process.cwd(), "data", "metadata");

// Initialize directories
export async function initDirectories() {
  try {
    // 检测是否在Vercel环境中
    const isVercelEnvironment = process.env.VERCEL === '1';
    
    // 在Vercel环境中不创建目录
    if (isVercelEnvironment) {
      console.log('在Vercel环境中运行，跳过目录初始化');
      return;
    }
    
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
    
    // 创建编辑历史目录
    const editHistoryDir = path.join(process.cwd(), "data", "edit-history");
    await fs.mkdir(editHistoryDir, { recursive: true });
    console.log('目录初始化成功:', { imagesDir, metadataDir, editHistoryDir });
  } catch (error) {
    console.error('Error initializing directories:', error);
    throw error; // 重新抛出错误，让调用者知道初始化失败
  }
}

// Save image to disk and return metadata
export async function saveImage(
  imageData: string,
  prompt: string,
  mimeType: string = "image/png",
  options: ImageOptions = {},
  parentId?: string
): Promise<ImageMetadata> {
  // Generate a unique ID
  const id = crypto.randomUUID();
  
  // Generate a unique filename
  const hash = crypto.createHash('md5').update(prompt + Date.now().toString()).digest('hex');
  const extension = mimeType.split('/')[1];
  const filename = `${hash}.${extension}`;
  const filePath = path.join(imagesDir, filename);
  
  // 检测是否在Vercel环境中
  const isVercelEnvironment = process.env.VERCEL === '1';
  
  // 创建图片元数据
  const metadata: ImageMetadata = {
    id,
    prompt,
    createdAt: new Date().toISOString(),
    filename,
    mimeType,
    size: Buffer.from(imageData, 'base64').length,
    url: `/generated-images/${filename}`,
    type: options.isUploadedImage ? "uploaded" : "generated" // 添加类型字段，标识是上传的图片还是生成的图片
  };
  
  // 如果提供了parentId，将其添加到元数据中
  if (parentId) {
    metadata.parentId = parentId;
  }
  
  // 如果提供了rootParentId，将其添加到元数据中
  if (options.rootParentId) {
    metadata.rootParentId = options.rootParentId;
  } 
  // 如果上传图片被编辑，将其自身ID作为rootParentId
  else if (options.isUploadedImage && parentId) {
    metadata.rootParentId = parentId;
  }
  
  try {
    // 只在非Vercel环境中保存到本地文件系统
    if (!isVercelEnvironment) {
      // Save the image to disk
      const buffer = Buffer.from(imageData, 'base64');
      await fs.writeFile(filePath, buffer);
      
      // Save metadata to disk
      const metadataPath = path.join(metadataDir, `${id}.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } else {
      console.log('在Vercel环境中运行，跳过本地文件存储');
    }
    
    // 自动保存到飞书
    console.log(`saveImage: 正在将图片自动上传到飞书...`);
    
    // 上传图片到飞书
    const fileInfo = await uploadImageToFeishu(
      imageData,
      `${id}.${extension}`,
      mimeType
    );
    
    console.log(`saveImage: 图片已上传到飞书，URL: ${fileInfo.url}`);
    
    // 保存记录到飞书多维表格
    const recordInfo = await saveImageRecord({
      id,
      url: fileInfo.url,
      fileToken: fileInfo.fileToken,
      prompt,
      timestamp: new Date().getTime(),
      parentId,
      rootParentId: metadata.rootParentId, // 传递rootParentId
      type: metadata.type // 传递图片类型字段
    });
    
    console.log(`saveImage: 记录已保存到飞书多维表格，record_id: ${recordInfo.record_id}`);
    
    // 更新元数据，包含飞书信息
    const updatedMetadata = {
      ...metadata,
      feishuUrl: fileInfo.url,
      feishuFileToken: fileInfo.fileToken
    };
    
    // 只在非Vercel环境中更新本地元数据文件
    if (!isVercelEnvironment) {
      const metadataPath = path.join(metadataDir, `${id}.json`);
      await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2));
    }
    
    return updatedMetadata;
  } catch (error) {
    console.error(`saveImage: 保存图片出错:`, error);
    
    // 如果在Vercel环境中且飞书上传失败，则无法提供图片
    if (isVercelEnvironment) {
      throw new Error(`无法保存图片: ${error.message}`);
    }
    
    // 在非Vercel环境中，如果飞书上传失败，仍然返回本地元数据
    return metadata;
  }
}

// Function to fetch image data from URL
export async function fetchImageFromUrl(url: string): Promise<{ data: string; mimeType: string }> {
  try {
    // 检测是否在Vercel环境中
    const isVercelEnvironment = process.env.VERCEL === '1';
    
    // Handle local URLs (from our own server)
    if (url.startsWith('/')) {
      // 在Vercel环境中，本地URL可能指向飞书存储的图片
      if (isVercelEnvironment) {
        console.log('在Vercel环境中，本地URL可能无效，尝试从飞书获取图片');
        
        // 如果是本地生成的图片URL，我们可能需要从飞书获取
        // 这里需要实现一个从飞书获取图片的逻辑
        // 但由于我们没有实现这个逻辑，所以直接抛出错误
        throw new Error(`在Vercel环境中无法访问本地文件: ${url}`);
      }
      
      const publicDir = path.join(process.cwd(), 'public');
      const filePath = path.join(publicDir, url.replace(/^\//, ''));
      
      const exists = await fs.stat(filePath).catch(() => false);
      if (!exists) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const buffer = await fs.readFile(filePath);
      const base64Data = buffer.toString('base64');
      
      // Determine mime type from file extension
      const extension = path.extname(filePath).toLowerCase();
      let mimeType = 'image/jpeg'; // default
      
      if (extension === '.png') {
        mimeType = 'image/png';
      } else if (extension === '.webp') {
        mimeType = 'image/webp';
      } else if (extension === '.gif') {
        mimeType = 'image/gif';
      }
      
      return {
        data: base64Data,
        mimeType
      };
    }
    
    // Handle external URLs
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    return {
      data: base64Data,
      mimeType
    };
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

// 从图片URL中提取图片ID
export async function getImageIdFromUrl(url: string): Promise<string | undefined> {
  try {
    // 检测是否在Vercel环境中
    const isVercelEnvironment = process.env.VERCEL === '1';
    
    // 如果是本地URL（例如 /generated-images/filename.png）
    if (url.startsWith('/generated-images/')) {
      // 在Vercel环境中，我们无法从本地文件系统获取图片ID
      if (isVercelEnvironment) {
        console.log('在Vercel环境中，无法从本地文件系统获取图片ID');
        return undefined;
      }
      
      const filename = path.basename(url);
      
      // 读取metadata目录下的所有文件
      const files = await fs.readdir(metadataDir);
      
      // 遍历所有元数据文件，查找匹配filename的图片
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(metadataDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const metadata = JSON.parse(content) as ImageMetadata;
          
          if (metadata.filename === filename) {
            return metadata.id;
          }
        }
      }
    }
    
    return undefined;
  } catch (error) {
    console.error('Error extracting image ID from URL:', error);
    return undefined;
  }
}

// Get image metadata by ID
export async function getImageMetadata(id: string): Promise<ImageMetadata | null> {
  try {
    const metadataPath = path.join(metadataDir, `${id}.json`);
    
    const exists = await fs.stat(metadataPath).catch(() => false);
    if (!exists) {
      return null;
    }
    
    const data = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(data) as ImageMetadata;
  } catch (error) {
    console.error('Error reading image metadata:', error);
    return null;
  }
}

// List all image metadata
export async function listImageMetadata(limit: number = 100, offset: number = 0): Promise<ImageMetadata[]> {
  try {
    const files = await fs.readdir(metadataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Get file stats for sorting
    const filesWithStats = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(metadataDir, file);
        const stats = await fs.stat(filePath);
        return { file, mtime: stats.mtime };
      })
    );
    
    // Sort by creation time (newest first)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Apply pagination
    const paginatedFiles = filesWithStats
      .slice(offset, offset + limit)
      .map(({ file }) => file);
    
    // Read metadata for each file
    const metadataPromises = paginatedFiles.map(async (file) => {
      const data = await fs.readFile(path.join(metadataDir, file), 'utf8');
      return JSON.parse(data) as ImageMetadata;
    });
    
    return await Promise.all(metadataPromises);
  } catch (error) {
    console.error('Error listing image metadata:', error);
    return [];
  }
}

// Delete old images (older than maxAge in days)
export async function cleanupOldImages(maxAge: number = 7): Promise<number> {
  try {
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    // Get all metadata files
    const files = await fs.readdir(metadataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    for (const file of jsonFiles) {
      const metadataPath = path.join(metadataDir, file);
      const stats = await fs.stat(metadataPath);
      
      // Check if file is older than maxAge
      if (now - stats.mtime.getTime() > maxAgeMs) {
        try {
          // Read metadata to get the image filename
          const data = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(data) as ImageMetadata;
          
          // Delete the image file
          const imagePath = path.join(imagesDir, metadata.filename);
          const imageExists = await fs.stat(imagePath).catch(() => false);
          if (imageExists) {
            await fs.unlink(imagePath);
          }
          
          // Delete the metadata file
          await fs.unlink(metadataPath);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting file ${file}:`, error);
        }
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old images:', error);
    return 0;
  }
}