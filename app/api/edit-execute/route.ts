import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { getAccessToken, saveImageRecord } from "@/lib/feishu";
import { v4 as uuidv4 } from 'uuid';

// 初始化Gemini API客户端
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 定义使用的模型ID
const MODEL_ID = "gemini-2.0-flash-exp";

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * 从飞书API获取图片数据
 * @param fileToken 飞书文件Token
 * @returns 图片数据信息
 */
async function fetchImageDataFromFeishu(fileToken: string): Promise<{ 
  imageData: string; 
  mimeType: string;
}> {
  console.log(`从飞书获取图片数据, fileToken: ${fileToken}`);
  
  // 获取访问令牌
  const token = await getAccessToken();
  
  // 使用飞书API获取图片数据
  const feishuUrl = `https://open.feishu.cn/open-apis/im/v1/images/${fileToken}`;
  const response = await fetch(feishuUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`从飞书获取图片数据失败: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const imageData = buffer.toString('base64');
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  
  return { imageData, mimeType };
}

/**
 * 调用Gemini API编辑图片
 * @param prompt 编辑提示词
 * @param imageData 图片数据(base64)
 * @param mimeType 图片MIME类型
 * @returns 生成结果
 */
async function callGeminiApi(prompt: string, imageData: string, mimeType: string) {
  console.log(`调用Gemini API编辑图片`);
  
  // 初始化模型
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      // @ts-expect-error - Gemini API JS缺少此类型
      responseModalities: ["Text", "Image"],
    },
  });
  
  // 准备消息内容
  const messageParts = [
    { text: prompt },
    {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      }
    }
  ];
  
  // 添加重试逻辑
  let result;
  let retryCount = 0;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      console.log(`尝试编辑图片, 尝试次数: ${retryCount + 1}/${MAX_RETRIES + 1}`);
      
      result = await model.generateContent(messageParts as any);
      
      // 验证响应结构
      if (!result || !result.response) {
        throw new Error(`响应结构不完整`);
      }
      
      console.log(`API调用成功`);
      return result;
      
    } catch (error: any) {
      console.error(`编辑图片API调用错误:`, error);
      
      retryCount++;
      
      // 根据错误类型处理重试
      const errorMessage = error.message || '';
      
      // 处理JSON解析错误
      if (errorMessage.includes("not valid JSON") && retryCount <= MAX_RETRIES) {
        console.log(`JSON解析错误，等待 ${RETRY_DELAY_MS}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      // 处理速率限制错误
      if (errorMessage.includes("Rate limit") && retryCount <= MAX_RETRIES) {
        const waitTime = RETRY_DELAY_MS * retryCount;
        console.log(`速率限制错误，等待 ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // 超过最大重试次数或其他错误
      if (retryCount > MAX_RETRIES) {
        console.error(`超过最大重试次数，放弃重试`);
      }
      
      throw error;
    }
  }
  
  throw new Error(`无法获取有效响应`);
}

/**
 * 解析Gemini API响应
 * @param response API响应
 * @returns 解析后的图片数据和文本
 */
function parseGeminiResponse(response: any): {
  imageData: string | null;
  mimeType: string;
  textResponse: string | null;
} {
  let textResponse: string | null = null;
  let imageData: string | null = null;
  let mimeType = "image/png";
  
  try {
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      const parts = response.candidates[0].content.parts;
      console.log(`成功获取响应，包含 ${parts.length} 个部分`);
      
      for (const part of parts) {
        if (part && "inlineData" in part && part.inlineData) {
          // 获取图片数据
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
          console.log(`获取到图片数据，类型: ${mimeType}`);
        } else if (part && "text" in part && part.text) {
          // 获取文本
          textResponse = part.text;
          console.log(`获取到文本响应: ${textResponse?.substring(0, 50)}...`);
        }
      }
    } else {
      console.error(`响应结构不完整:`, response);
    }
  } catch (parseError) {
    console.error(`解析响应时发生错误:`, parseError);
    throw parseError;
  }
  
  return { imageData, mimeType, textResponse };
}

/**
 * 将图片上传到飞书并返回 URL
 */
async function uploadImageToFeishu(
  imageData: string,
  prompt: string,
  mimeType: string,
  parentId?: string
): Promise<{ uploadedImageUrl: string; imageId: string }> {
  console.log("开始上传图片到飞书");
  
  // 生成唯一ID
  const imageId = uuidv4();
  
  // 获取访问令牌
  const token = await getAccessToken();
  
  // 准备文件名和数据
  const fileName = `${imageId}.png`;
  const base64Data = imageData;
  
  // 将base64转换为Buffer
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // 准备FormData
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append('image_type', 'message');
  formData.append('image', blob, fileName);
  
  // 调用飞书API上传图片
  const uploadUrl = 'https://open.feishu.cn/open-apis/im/v1/images';
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`上传图片到飞书失败: ${uploadResponse.statusText}`);
  }
  
  const uploadResult = await uploadResponse.json();
  
  if (!uploadResult.data || !uploadResult.data.image_key) {
    throw new Error('上传图片到飞书失败: 未返回图片密钥');
  }
  
  const fileToken = uploadResult.data.image_key;
  const uploadedImageUrl = `https://open.feishu.cn/open-apis/im/v1/images/${fileToken}`;
  
  console.log(`图片上传成功, URL: ${uploadedImageUrl}`);
  
  return { uploadedImageUrl, imageId };
}

/**
 * 异步保存图片记录到飞书多维表格
 */
async function saveImageRecordAsync(
  imageId: string,
  imageUrl: string,
  prompt: string,
  mimeType: string,
  options: {
    isUploadedImage?: boolean;
    rootParentId?: string;
    isVercelEnv?: boolean;
  },
  parentId?: string
): Promise<void> {
  // 使用Promise.resolve().then()确保这是异步非阻塞的
  Promise.resolve().then(async () => {
    try {
      console.log(`开始异步保存图片记录, ID: ${imageId}`);
      
      // 从图片URL提取fileToken
      const fileToken = imageUrl.split('/').pop() || '';
      
      // 准备记录数据
      const recordData = {
        id: imageId,
        url: imageUrl,
        fileToken: fileToken,
        prompt: prompt,
        timestamp: Date.now().toString(),
        parentId: parentId || '',
        rootParentId: options.rootParentId || parentId || '',
        type: options.isUploadedImage ? 'uploaded' : 'generated'
      };
      
      // 调用保存记录函数
      await saveImageRecord(recordData);
      
      console.log(`图片记录异步保存成功, ID: ${imageId}`);
    } catch (error) {
      // 仅记录错误，不影响API响应
      console.error(`异步保存图片记录失败:`, error);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    // 解析请求数据
    const { prompt, prepareId, fileToken, rootParentId, isUploadedImage } = await req.json();

    // 验证必要参数
    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PROMPT",
          message: "缺少提示词参数"
        }
      } as ApiResponse, { status: 400 });
    }

    if (!fileToken) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_FILE_TOKEN",
          message: "缺少文件Token参数"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 获取图片数据
      const { imageData, mimeType } = await fetchImageDataFromFeishu(fileToken);
      
      // 调用Gemini API编辑图片
      const result = await callGeminiApi(prompt, imageData, mimeType);
      
      if (!result) {
        return NextResponse.json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "超出 API 速率限制，请稍后再试"
          }
        } as ApiResponse, { status: 429 });
      }
      
      // 解析响应
      const { imageData: generatedImageData, mimeType: responseMimeType, textResponse } = parseGeminiResponse(result.response);
      
      if (!generatedImageData) {
        return NextResponse.json({
          success: false,
          error: {
            code: "NO_IMAGE_GENERATED",
            message: "未能生成图片"
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 保存生成的图片
      try {
        console.log("开始保存编辑后的图片");
        
        // 将上传到飞书的部分分离出来
        const { uploadedImageUrl, imageId } = await uploadImageToFeishu(
          generatedImageData,
          prompt,
          responseMimeType,
          prepareId
        );
        
        // 异步保存记录到飞书多维表格，不阻塞API响应
        saveImageRecordAsync(
          imageId,
          uploadedImageUrl,
          prompt,
          responseMimeType,
          { 
            isUploadedImage: isUploadedImage === true,
            rootParentId: rootParentId || prepareId,
            isVercelEnv: true  
          },  
          prepareId  // 使用准备阶段的ID作为父ID
        );
        
        // 立即返回成功响应，不等待记录保存完成
        return NextResponse.json({
          success: true,
          data: {
            imageUrl: uploadedImageUrl,
            id: imageId,
            prompt: prompt,
            textResponse: textResponse || ""
          }
        } as ApiResponse);
        
      } catch (saveError: any) {
        console.error("保存编辑后的图片失败:", saveError);
        
        return NextResponse.json({
          success: false,
          error: {
            code: "SAVE_ERROR",
            message: "保存编辑后的图片失败",
            details: saveError.message
          }
        } as ApiResponse, { status: 500 });
      }
      
    } catch (error: any) {
      console.error(`执行编辑失败:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: "EXECUTION_FAILED",
          message: "执行图片编辑失败",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`处理请求失败:`, error);
    return NextResponse.json({
      success: false,
      error: {
        code: "REQUEST_PROCESSING_ERROR",
        message: "处理请求时发生错误",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
