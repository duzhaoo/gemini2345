import { saveImage } from '@/lib/server-utils';
import { ApiResponse, ImageOptions } from '@/lib/types';
import { NextResponse } from 'next/server';

/**
 * 统一处理从Gemini API获取的响应，提取图像和文本数据
 */
export function extractDataFromGeminiResponse(response: any) {
  console.log(`处理Gemini响应，提取图像和文本数据`);
  
  let textResponse = null;
  let imageData = null;
  let mimeType = "image/png";
  
  try {
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      const parts = response.candidates[0].content.parts;
      console.log(`成功获取响应，包含 ${parts.length} 个部分`);
      
      for (const part of parts) {
        if (part && "inlineData" in part && part.inlineData) {
          // 获取图像数据
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
          console.log(`获取到图片数据，类型: ${mimeType}, 大小: ${imageData.length} 字符`);
        } else if (part && "text" in part && part.text) {
          // 存储文本响应
          textResponse = part.text;
          console.log(`获取到文本响应: ${textResponse?.substring(0, 50)}...`);
        } else {
          console.log(`未知的响应部分类型:`, typeof part);
        }
      }
    } else {
      console.error(`响应结构不完整:`, response);
    }
    
    return { textResponse, imageData, mimeType };
  } catch (error) {
    console.error(`提取Gemini响应数据时发生错误:`, error);
    throw error; // 将错误传递给调用方
  }
}

/**
 * 验证并优化图像数据以适应飞书API需求
 */
export async function validateAndOptimizeImage(imageData: string, mimeType: string) {
  console.log(`validateAndOptimizeImage: 开始验证图像，MIME类型: ${mimeType}`);
  
  try {
    if (!imageData || typeof imageData !== 'string') {
      throw new Error('图像数据无效或为空');
    }
    
    // 检查图像大小
    const sizeInBytes = Math.ceil((imageData.length * 3) / 4);
    const sizeInMB = sizeInBytes / (1024 * 1024);
    console.log(`validateAndOptimizeImage: 图像大小约为 ${sizeInMB.toFixed(2)}MB`);
    
    if (sizeInMB > 9.5) {
      console.warn(`validateAndOptimizeImage: 警告 - 图像大小(${sizeInMB.toFixed(2)}MB)接近飞书10MB限制`);
    }
    
    // 验证MIME类型是否支持
    const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedMimeTypes.includes(mimeType.toLowerCase())) {
      console.warn(`validateAndOptimizeImage: 警告 - 不常见的MIME类型: ${mimeType}`);
    }
    
    return {
      imageData,
      mimeType,
      sizeInMB,
      isValid: true
    };
  } catch (error) {
    console.error(`validateAndOptimizeImage: 验证图像失败:`, error);
    throw error;
  }
}

/**
 * 统一处理和保存图像
 */
export async function processAndSaveImage(
  imageData: string | null, 
  prompt: string, 
  mimeType: string,
  options?: ImageOptions & { 
    isVercelEnv?: boolean,
    isUploadedImage?: boolean,
    rootParentId?: string
  },
  parentId?: string
) {
  console.log(`开始处理和保存图像，提示词长度: ${prompt.length}字符`);
  
  if (!imageData) {
    console.error(`无图像数据可保存`);
    throw new Error("No image data to save");
  }
  
  try {
    // 验证图像数据
    const validatedImage = await validateAndOptimizeImage(imageData, mimeType);
    if (!validatedImage.isValid) {
      throw new Error('图像数据无效');
    }
    
    // 统一保存图像
    const metadata = await saveImage(
      validatedImage.imageData,
      prompt,
      validatedImage.mimeType,
      options || { isVercelEnv: true },
      parentId
    );
    
    if (!metadata) {
      throw new Error(`保存图片失败，返回的元数据为空`);
    }
    
    console.log(`图片保存成功，ID: ${metadata.id}`);
    return metadata;
  } catch (error) {
    console.error(`保存图片时发生错误:`, error);
    throw error; // 将错误传递给调用方
  }
}

/**
 * 处理图像API错误，返回统一格式的错误响应
 */
export function handleImageApiError(error: unknown, errorCode: string, errorMessage: string) {
  console.error(`${errorMessage}:`, error);
  
  // 检查是否是JSON解析错误
  const errorDetail = error instanceof Error ? error.message : String(error);
  if (errorDetail.includes('Unexpected') && errorDetail.includes('JSON')) {
    return NextResponse.json({
      success: false,
      error: {
        code: "JSON_PARSE_ERROR",
        message: "响应数据解析错误，请重试",
        details: errorDetail
      }
    } as ApiResponse, { status: 400 });
  }
  
  // 返回通用错误
  return NextResponse.json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      details: errorDetail,
      stack: error instanceof Error ? error.stack : undefined
    }
  } as ApiResponse, { status: 500 });
}
