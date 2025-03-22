import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { getImageRecordById, getAccessToken } from "@/lib/feishu";

// 初始化Gemini API客户端
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 定义使用的模型ID
const MODEL_ID = "gemini-2.0-flash-exp";

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * 从URL中提取图片ID
 * @param imageUrl 图片URL
 * @returns 提取的图片ID或null
 */
async function extractImageIdFromUrl(imageUrl: string): Promise<string | null> {
  console.log(`尝试从URL提取图片ID: ${imageUrl}`);
  
  // 检查是否是img_v3_格式
  if (imageUrl.includes('img_v3_')) {
    const matches = imageUrl.match(/img_v3_[\w-]+/);
    if (matches && matches[0]) {
      const imageId = matches[0];
      console.log(`从URL中提取到ID: ${imageId}`);
      return imageId;
    }
  }
  
  // 尝试从URL查询参数中获取ID
  try {
    const urlObj = new URL(imageUrl);
    const idFromQuery = urlObj.searchParams.get('id');
    if (idFromQuery) {
      console.log(`从URL查询参数中提取到ID: ${idFromQuery}`);
      return idFromQuery;
    }
    
    // 尝试从路径中提取ID
    const pathParts = urlObj.pathname.split('/');
    for (const part of pathParts) {
      if (part && part.length > 8) {
        console.log(`从路径中提取到可能的ID: ${part}`);
        return part;
      }
    }
  } catch (err) {
    console.error("解析URL失败:", err);
  }
  
  // 尝试匹配UUID格式
  const uuidMatches = imageUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatches && uuidMatches[0]) {
    console.log(`从URL中提取到UUID格式ID: ${uuidMatches[0]}`);
    return uuidMatches[0];
  }
  
  return null;
}

/**
 * 从飞书API获取图片数据
 * @param imageId 图片ID或fileToken
 * @returns 图片数据信息
 */
async function fetchImageFromFeishu(imageId: string): Promise<{ 
  imageData: string; 
  mimeType: string; 
  imageRecord: any;
}> {
  console.log(`从飞书获取图片数据, ID: ${imageId}`);
  
  // 获取图片记录
  const imageRecord = await getImageRecordById(imageId);
  if (!imageRecord || !imageRecord.fileToken) {
    throw new Error(`无法获取图片记录或fileToken: ${imageId}`);
  }
  
  // 获取访问令牌
  const token = await getAccessToken();
  
  // 使用飞书API获取图片数据
  const feishuUrl = `https://open.feishu.cn/open-apis/im/v1/images/${imageRecord.fileToken}`;
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
  
  return { imageData, mimeType, imageRecord };
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
      
      // 记录错误响应文本
      if (error.response && typeof error.response.text === 'function') {
        try {
          const errorText = await error.response.text();
          console.error('错误响应文本:', errorText);
        } catch (textError) {
          console.error('无法获取错误响应文本');
        }
      }
      
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
        } else {
          console.log(`未知的响应部分类型:`, part);
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
 * 处理图片编辑API请求
 */
export async function POST(req: NextRequest) {
  console.log(`编辑图片API - 请求开始处理`);
  console.log(`编辑图片API - 当前环境: Vercel`);
  
  try {
    // 初始化变量
    let currentImageId: string | undefined;
    let parentId: string | undefined;
    let isUploadedImage = false;
    let metadata: any = null;
    
    // 解析请求数据
    const { prompt, imageUrl } = await req.json();

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

    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_URL",
          message: "缺少图片URL参数"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 验证URL类型
    if (!imageUrl.includes('open.feishu.cn')) {
      return NextResponse.json({
        success: false,
        error: {
          code: "INVALID_URL_IN_VERCEL",
          message: "在Vercel环境中只能使用飞书URL"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 从飞书URL提取图片ID
      currentImageId = await extractImageIdFromUrl(imageUrl);
      
      if (!currentImageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "MISSING_IMAGE_ID",
            message: "无法从飞书URL获取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 获取图片记录和数据
      const { imageData, mimeType, imageRecord } = await fetchImageFromFeishu(currentImageId);
      
      // 设置父ID和类型
      parentId = currentImageId;
      isUploadedImage = imageRecord.type === "uploaded";
      
      console.log("图片类型检查:", { imageUrl, currentImageId, parentId, isUploadedImage });
      
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
        console.log("开始调用saveImage保存编辑后的图片, 参数:", {
          promptLength: prompt.length,
          mimeType: responseMimeType,
          options: { 
            isUploadedImage,
            rootParentId: parentId,
            isVercelEnv: true
          },
          parentId: currentImageId
        });
        
        metadata = await saveImage(
          generatedImageData,
          prompt,
          responseMimeType,
          { 
            isUploadedImage,
            rootParentId: parentId,  // 增加rootParentId继承，确保编辑链不断裂
            isVercelEnv: true  // 传递Vercel环境标志
          },  
          currentImageId  // 传递当前图片ID作为直接父ID
        );
        
        console.log("保存图片返回的metadata:", JSON.stringify(metadata, null, 2));
      } catch (saveError) {
        console.error(`保存图片时发生错误:`, saveError);
        return NextResponse.json({
          success: false,
          error: {
            code: "IMAGE_SAVE_ERROR",
            message: "保存生成的图片时发生错误",
            details: saveError instanceof Error ? saveError.message : String(saveError)
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 如果有parentId和metadata，保存编辑历史
      if (parentId && metadata && metadata.id) {
        try {
          // 记录编辑历史关联
          console.log(`设置编辑历史关联: 源图片ID ${parentId}, 编辑结果ID ${metadata.id}`);
        } catch (historyError) {
          console.error(`记录编辑历史时发生错误:`, historyError);
          // 不中断处理，继续返回结果
        }
      }
      
      // 验证返回数据完整性
      const responseData = {
        id: metadata?.id || "",
        url: metadata?.url || "",
        prompt: prompt,
        textResponse: textResponse || ""
      };
      
      console.log("返回给前端的数据:", JSON.stringify(responseData, null, 2));
      
      // 检查关键字段
      if (!responseData.url) {
        console.warn("警告: 返回给前端的URL为空!");
      }
      
      if (!responseData.id) {
        console.warn("警告: 返回给前端的ID为空!");
      }
      
      // 返回成功响应
      return NextResponse.json({
        success: true,
        data: responseData
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`编辑图片处理错误:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: "PROCESSING_ERROR",
          message: "处理图片编辑请求时发生错误",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`编辑图片API请求处理错误:`, error);
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
