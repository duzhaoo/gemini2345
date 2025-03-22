import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse, ImageOptions } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { uploadImageToFeishu, saveImageRecord } from "@/lib/feishu";
import crypto from 'crypto';

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
    let metadata;
    try {
      // 生成一个唯一ID，将其同时用于图片ID和parentId
      const id = crypto.randomUUID();
      
      const imageOptions = {
        ...options as ImageOptions,
        isVercelEnv: true, // 指定在Vercel环境运行
        rootParentId: id // 直接设置rootParentId也为当前图片ID
      };
      
      console.log(`开始保存生成的图片...，预先生成ID为图片ID和parentId: ${id}`);
      
      // 调用saveImage时直接传递图片ID作为parentId
      console.log(`Generate API - 直接调用saveImage并传递parentId=${id}，用于解决parentId为空的问题`);
      
      metadata = await saveImage(
        imageData, 
        prompt, 
        mimeType, 
        imageOptions,
        id  // 直接传递ID作为parentId参数
      );
      
      if (!metadata) {
        throw new Error(`保存图片失败，返回的元数据为空`);
      }
      
      console.log(`图片保存成功，元数据:`, JSON.stringify({
        id: metadata.id,
        parentId: metadata.parentId || '空',
        rootParentId: metadata.rootParentId || '空',
        提示词长度: prompt.length
      }, null, 2));
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