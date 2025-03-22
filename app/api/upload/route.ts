import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { uploadImageToFeishu, saveImageRecord } from '@/lib/feishu';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;

    if (!image) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_IMAGE', message: 'Image is required' } },
        { status: 400 }
      );
    }

    // Create a hash of the file to use as filename
    const buffer = await image.arrayBuffer();
    const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');
    
    // Determine file extension from mime type
    const mimeType = image.type;
    let extension = 'png';
    
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      extension = 'jpg';
    } else if (mimeType === 'image/webp') {
      extension = 'webp';
    }
    
    const filename = `${hash}.${extension}`;
    const filepath = join(process.cwd(), 'public', 'generated-images', filename);
    
    // Write the file to disk
    const imageBuffer = Buffer.from(buffer);
    await writeFile(filepath, imageBuffer);
    
    // 为元数据创建唯一ID
    const id = uuidv4();
    const prompt = formData.get('prompt') as string || "用户上传的原始图片";
    
    // Create metadata
    const metadata: any = {
      id,
      prompt,
      createdAt: new Date().toISOString(),
      filename,
      mimeType,
      size: buffer.byteLength,
      url: `/generated-images/${filename}`,
      type: "uploaded", // 标记为用户上传的图片
    };
    
    // 将元数据保存到本地文件系统
    const metadataDir = join(process.cwd(), 'data', 'metadata');
    const metadataPath = join(metadataDir, `${id}.json`);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 同步上传到飞书
    try {
      console.log('正在将上传的原始图片同步到飞书...');
      // 转换为Base64
      const imageBase64 = imageBuffer.toString('base64');
      
      // 上传图片到飞书
      const fileInfo = await uploadImageToFeishu(
        imageBase64,
        filename,
        mimeType
      );
      
      console.log('图片已上传到飞书，URL:', fileInfo.url);
      
      // 保存记录到飞书多维表格
      const recordInfo = await saveImageRecord({
        id,
        url: fileInfo.url,
        fileToken: fileInfo.fileToken,
        prompt,
        timestamp: new Date().getTime(),
        parentId: undefined
        // editGroupId字段已移除
      });
      
      console.log('记录已保存到飞书多维表格，ID:', recordInfo.record_id);
      
      // 更新元数据，添加飞书信息
      metadata.feishuUrl = fileInfo.url;
      metadata.feishuFileToken = fileInfo.fileToken;
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (feishuError) {
      console.error('将图片上传到飞书时出错:', feishuError);
      // 继续执行，不中断上传流程，即使飞书同步失败也返回成功上传到本地的结果
    }
    
    // Return the image URL
    return NextResponse.json({
      success: true,
      data: {
        imageUrl: `/generated-images/${filename}`,
        description: null,
        metadata,
      },
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { success: false, error: { code: 'UPLOAD_ERROR', message: 'Failed to upload image' } },
      { status: 500 }
    );
  }
}