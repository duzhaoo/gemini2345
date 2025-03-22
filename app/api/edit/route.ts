import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { saveImage, fetchImageFromUrl, getImageIdFromUrl, initDirectories } from "@/lib/server-utils";
import { promises as fs } from 'fs';
import path from 'path';

// Initialize the Google Gen AI client with your API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the model ID for Gemini 2.0 Flash experimental
const MODEL_ID = "gemini-2.0-flash-exp";

export async function POST(req: NextRequest) {
  try {
    // 初始化目录，确保包括 edit-history 在内的所有目录都存在
    await initDirectories();
    
    // Parse JSON request
    const requestData = await req.json();
    const { prompt, imageUrl } = requestData;

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PROMPT",
          message: "Prompt is required"
        }
      } as ApiResponse, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_URL",
          message: "Image URL is required"
        }
      } as ApiResponse, { status: 400 });
    }

    // 从图片URL中提取当前图片ID
    const currentImageId = await getImageIdFromUrl(imageUrl);
    
    // 检查当前图片的原始父ID
    let parentId = currentImageId; // 默认使用当前图片ID作为parentId
    let isUploadedImage = false;
    
    // 获取该图片对应的所有元数据
    try {
      const metadataDir = path.join(process.cwd(), "data", "metadata");
      const metadataPath = path.join(metadataDir, `${currentImageId}.json`);
      const content = await fs.readFile(metadataPath, "utf8");
      const imageMetadata = JSON.parse(content);
      
      // 如果是上传图片，则使用当前图片ID作为根parentId
      if (imageMetadata.type === "uploaded") {
        parentId = currentImageId;
        isUploadedImage = true;
      } 
      // 如果是生成图片且有rootParentId属性，则继续parentId
      else if (imageMetadata.rootParentId) {
        parentId = imageMetadata.rootParentId;
      } 
      // 如果有parentId则使用它
      else if (imageMetadata.parentId) {
        parentId = imageMetadata.parentId;
      }
    } catch (err) {
      console.log("获取图片元数据失败，使用当前图片ID作为parentId:", err);
    }
    try {
      // 尝试获取原始图片的元数据
      const metadataDir = path.join(process.cwd(), "data", "metadata");
      const files = await fs.readdir(metadataDir);
      
      for (const file of files) {
        if (file.endsWith(".json")) {
          const metadataPath = path.join(metadataDir, file);
          const content = await fs.readFile(metadataPath, "utf8");
          const metadata = JSON.parse(content);
          
          // 检查URL是否匹配，以及是否为上传的图片
          if (metadata.url === imageUrl && metadata.type === "uploaded") {
            isUploadedImage = true;
            break;
          }
        }
      }
    } catch (err) {
      console.error("查询上传图片元数据时出错:", err);
      // 继续处理，不中断流程
    }
    
    console.log("图片类型检查:", { imageUrl, isUploadedImage });

    // Fetch image data from URL
    const { data: imageData, mimeType } = await fetchImageFromUrl(imageUrl);

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

    // Prepare the message parts with proper typing
    const messageParts = [
      { text: prompt },
      {
        inlineData: {
          data: imageData,
          mimeType: mimeType
        }
      }
    ];

    // 添加重试逻辑处理速率限制
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000; // 2秒
    
    while (retryCount <= maxRetries) {
      try {
        // Send the message to generate content with proper typing
        console.log(`尝试编辑图片, 尝试次数: ${retryCount + 1}/${maxRetries + 1}`);
        result = await model.generateContent(messageParts as any);
        break; // 成功则跳出循环
      } catch (error: any) {
        retryCount++;
        
        // 判断是否是速率限制错误
        if (error.message && error.message.includes("Rate limit") && retryCount <= maxRetries) {
          console.log(`速率限制错误，等待 ${retryDelay * retryCount}ms 后重试...`);
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
    let generatedImageData = null;
    let responseMimeType = "image/png";

    // Process the response
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      const parts = response.candidates[0].content.parts;
      
      for (const part of parts) {
        if (part && "inlineData" in part && part.inlineData) {
          // Get the image data
          generatedImageData = part.inlineData.data;
          responseMimeType = part.inlineData.mimeType || "image/png";
        } else if (part && "text" in part && part.text) {
          // Store the text
          textResponse = part.text;
        }
      }
    }

    if (!generatedImageData) {
      return NextResponse.json({
        success: false,
        error: {
          code: "NO_IMAGE_GENERATED",
          message: "No image was generated"
        }
      } as ApiResponse, { status: 500 });
    }

    // 将parentId传递给saveImage函数以及isUploadedImage标记
    const metadata = await saveImage(
      generatedImageData,
      prompt,
      responseMimeType,
      { 
        isUploadedImage,
        rootParentId: parentId  // 增加rootParentId继承，确保编辑链不断裂
      },  
      currentImageId  // 传递当前图片ID作为直接父ID
    );
    
    // 如果有parentId，保存编辑历史
    if (parentId) {
      try {
        // 记录编辑历史
        console.log(`保存编辑历史记录: 源图片ID ${parentId}, 编辑结果ID ${metadata.id}`);
        
        // 调用编辑历史API
        const historyResponse = await fetch(`${req.nextUrl.origin}/api/edit-history/${parentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            resultImageId: metadata.id
            // editGroupId字段已移除
          })
        });
        
        const historyResult = await historyResponse.json();
        console.log('编辑历史记录保存结果:', historyResult);
      } catch (historyError) {
        // 记录错误但不中断主流程
        console.error('保存编辑历史记录失败:', historyError);
      }
    }

    // Return the image URL, description, and metadata as JSON
    return NextResponse.json({
      success: true,
      data: {
        imageUrl: metadata.url,
        description: textResponse,
        metadata
      }
    } as ApiResponse);
  } catch (error) {
    console.error("Error editing image:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "EDIT_FAILED",
        message: "Failed to edit image",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}