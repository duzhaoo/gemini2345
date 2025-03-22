import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse, ImageOptions } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { uploadImageToFeishu, saveImageRecord } from "@/lib/feishu";
import { extractDataFromGeminiResponse, processAndSaveImage, handleImageApiError } from "@/lib/image-utils";

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

    // 使用统一函数处理Gemini响应
    let { textResponse, imageData, mimeType } = extractDataFromGeminiResponse(response);

    if (!imageData) {
      return NextResponse.json({
        success: false,
        error: {
          code: "NO_IMAGE_GENERATED",
          message: "No image was generated"
        }
      } as ApiResponse, { status: 500 });
    }

    // 使用统一函数保存图像
    let metadata;
    try {
      console.log(`开始保存生成的图片...`);
      metadata = await processAndSaveImage(
        imageData, 
        prompt, 
        mimeType, 
        { 
          ...options as ImageOptions,
          isVercelEnv: true
        }
      );
    } catch (saveError) {
      return handleImageApiError(saveError, "IMAGE_SAVE_ERROR", "保存生成的图片时发生错误");
    }

    // Return the image URL, description, and metadata as JSON
    return NextResponse.json({
      success: true,
      data: {
        // 如果在Vercel环境中并且有飞书URL，则使用飞书URL
        imageUrl: metadata.feishuUrl || metadata.url,
        description: textResponse,
        metadata,
        isVercelEnv: true
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