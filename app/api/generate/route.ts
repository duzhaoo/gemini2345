import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse, ImageOptions } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { uploadImageToFeishu, saveImageRecord } from "@/lib/feishu";

// Initialize the Google Gen AI client with your API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the model ID for Gemini 2.0 Flash experimental
const MODEL_ID = "gemini-2.0-flash-exp";

export async function POST(req: NextRequest) {
  try {
    // Parse JSON request
    const requestData = await req.json();
    const { prompt, options } = requestData;

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PROMPT",
          message: "Prompt is required"
        }
      } as ApiResponse, { status: 400 });
    }

    // Get the model with the correct configuration
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        // @ts-expect-error - Gemini API JS is missing this type
        responseModalities: ["Text", "Image"],
      },
    });

    // 添加重试逻辑
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000; // 2秒
    
    while (retryCount <= maxRetries) {
      try {
        // Send the prompt to generate an image
        console.log(`尝试生成图片, 尝试次数: ${retryCount + 1}/${maxRetries + 1}`);
        result = await model.generateContent(prompt);
        break; // 成功则跳出循环
      } catch (error: any) {
        retryCount++;
        
        // 判断是否是速率限制错误
        if (error.message && error.message.includes("Rate limit") && retryCount <= maxRetries) {
          console.log(`速率限制错误，等待 ${retryDelay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount)); // 等待时间逐次增加
          continue;
        }
        
        // 如果是其他错误或者已经超过最大重试次数，则抛出错误
        throw error;
      }
    }
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "超出 API 速率限制，请稍后再试"
        }
      } as ApiResponse, { status: 429 });
    }
    const response = result.response;

    let textResponse = null;
    let imageData = null;
    let mimeType = "image/png";

    // Process the response
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      const parts = response.candidates[0].content.parts;
      
      for (const part of parts) {
        if (part && "inlineData" in part && part.inlineData) {
          // Get the image data
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
        } else if (part && "text" in part && part.text) {
          // Store the text
          textResponse = part.text;
        }
      }
    }

    if (!imageData) {
      return NextResponse.json({
        success: false,
        error: {
          code: "NO_IMAGE_GENERATED",
          message: "No image was generated"
        }
      } as ApiResponse, { status: 500 });
    }

    // Save the image and get metadata
    const metadata = await saveImage(
      imageData, 
      prompt, 
      mimeType, 
      options as ImageOptions
    );

    // 上传到飞书文件存储(新增功能)
    try {
      console.log(`开始上传图片到飞书，图片ID: ${metadata.id}`);
      
      const fileName = `${metadata.id}.png`;
      console.log(`正在调用uploadImageToFeishu，文件名: ${fileName}, MIME类型: ${mimeType}`);
      
      const fileInfo = await uploadImageToFeishu(imageData, fileName, mimeType);
      console.log(`图片成功上传到飞书，获取到文件信息:`, {
        url: fileInfo.url,
        fileToken: fileInfo.fileToken
      });
      
      // 注意: 不在这里调用saveImageRecord，避免重复保存
      // saveImageRecord已经在saveImage函数中被调用
      
      // 增强返回的元数据
      metadata.feishuUrl = fileInfo.url;
      metadata.feishuFileToken = fileInfo.fileToken;
      console.log(`飞书同步完成，已更新元数据`);
    } catch (feishuError: any) {
      // 如果飞书存储失败，记录错误但不影响原功能
      console.error("飞书存储失败，但原功能正常。错误详情:", {
        message: feishuError?.message,
        stack: feishuError?.stack,
        response: feishuError?.response?.data
      });
      metadata.feishuSyncFailed = true;
    }

    // Return the image URL, description, and metadata as JSON
    return NextResponse.json({
      success: true,
      data: {
        imageUrl: process.env.VERCEL === '1' && metadata.feishuUrl ? metadata.feishuUrl : metadata.url,
        description: textResponse,
        metadata,
        isVercelEnv: process.env.VERCEL === '1'
      }
    } as ApiResponse);
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "GENERATION_FAILED",
        message: "Failed to generate image",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}