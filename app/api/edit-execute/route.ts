import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { getAccessToken } from "@/lib/feishu";
import crypto from 'crypto';

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
  
  // 优化提示词格式以避免文字出现在图片中
  const enhancedPrompt = `请根据以下描述生成一张图片：${prompt}。

要求：
- 请不要在图片中添加任何文字
- 只生成纯粹的图像内容而没有文字叠加
- 图片只包含相关视觉元素，不包含文字
- 请不要将指令作为图片内容的一部分`;
  
  console.log(`优化后的提示词： ${enhancedPrompt}`);

  // 准备消息内容
  const messageParts = [
    { text: enhancedPrompt },
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



export async function POST(req: NextRequest) {
  try {
    // 解析请求数据
    const { prompt, prepareId, fileToken, rootParentId, parentId, isUploadedImage } = await req.json();

    // 输出请求参数信息，便于调试
    console.log(`编辑请求参数: prompt=${prompt?.substring(0, 20)}..., prepareId=${prepareId}, fileToken=${fileToken}, rootParentId=${rootParentId}, parentId=${parentId}, isUploadedImage=${isUploadedImage}`);

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
      // 输出详细的日志，便于调试
      console.log(`开始编辑图片: prepareId=${prepareId}, fileToken=${fileToken}, parentId=${parentId}, rootParentId=${rootParentId}`);
      
      // 获取图片数据 - 使用当前选中的图片的fileToken
      // 这里的fileToken应该是当前选中的图片的fileToken，而不是原始图片的fileToken
      const { imageData, mimeType } = await fetchImageDataFromFeishu(fileToken);
      
      console.log(`成功获取当前选中的图片数据，fileToken: ${fileToken}, mimeType: ${mimeType}`);
      
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
      
      // 直接返回base64图片数据，不保存到飞书
      try {
        console.log("直接返回编辑后的图片数据");
        
        // 生成唯一ID
        const id = crypto.randomUUID();
        
        // 输出原始参数，便于调试
        console.log(`原始参数: prepareId=${prepareId}, parentId=${parentId}, rootParentId=${rootParentId}`);
        
        // 对rootParentId进行更严格的处理
        // 如果有rootParentId，则使用它
        // 如果没有rootParentId但有parentId，则需要检查parentId是否就是根图片
        // 如果都没有，才使用prepareId
        let actualRootParentId = rootParentId;
        if (!actualRootParentId) {
          if (parentId && parentId === prepareId) {
            // 如果parentId和prepareId相同，说明当前图片就是原始图片
            // 则将原始图片ID作为rootParentId
            actualRootParentId = parentId;
            console.log(`没有rootParentId，parentId和prepareId相同，使用parentId作为rootParentId: ${parentId}`);
          } else {
            // 如果都没有，才使用prepareId
            actualRootParentId = prepareId;
            console.log(`没有rootParentId，使用prepareId作为rootParentId: ${prepareId}`);
          }
        } else {
          console.log(`使用传入的rootParentId: ${rootParentId}`);
        }
        
        // 对parentId进行更严格的处理
        // 当前选中的图片ID应该是parentId
        // 如果没有parentId，才使用prepareId
        let actualParentId = parentId || prepareId;
        
        // 添加详细的日志输出，便于调试
        if (parentId) {
          console.log(`使用传入的parentId: ${parentId}`);
        } else {
          console.log(`没有传入parentId，使用prepareId作为parentId: ${prepareId}`);
        }
        
        // 添加日志输出，便于调试ID关系
        console.log(`编辑图片ID关系: 新ID=${id}, parentId=${actualParentId}, rootParentId=${actualRootParentId}, fileToken=${fileToken}`);
        
        // 确保图片编辑链的完整性，将新生成的图片作为下一次编辑的父级
        
        // 返回成功响应，包含base64图片数据
        return NextResponse.json({
          success: true,
          data: {
            imageData: generatedImageData,  // 直接返回base64图片数据
            mimeType: responseMimeType,     // 返回图片MIME类型
            id: id,
            prompt: prompt,
            fileToken: fileToken,           // 返回原始图片的fileToken
            prepareId: prepareId,           // 返回准备ID
            rootParentId: actualRootParentId, // 使用传入的rootParentId或者将prepareId作为rootParentId
            parentId: actualParentId, // 使用实际的parentId，确保对已编辑过的图片再次编辑时保持parentId一致
            isUploadedImage: isUploadedImage === true,
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
