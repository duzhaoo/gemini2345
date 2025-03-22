import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { saveImage, fetchImageFromUrl, getImageIdFromUrl, initDirectories } from "@/lib/server-utils";
import { promises as fs } from 'fs';
import path from 'path';
import { getImageRecordById, getAccessToken } from "@/lib/feishu";

// Initialize the Google Gen AI client with your API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the model ID for Gemini 2.0 Flash experimental
const MODEL_ID = "gemini-2.0-flash-exp";

export async function POST(req: NextRequest) {
  try {
    // 检测是否在Vercel环境中
    const isVercelEnvironment = process.env.VERCEL === '1';
    console.log(`编辑图片API - 当前环境: ${isVercelEnvironment ? 'Vercel' : '本地开发'}`);
    
    // 仅在本地环境初始化目录
    if (!isVercelEnvironment) {
      await initDirectories();
    }
    
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
    let currentImageId: string | undefined;
    let parentId: string | undefined;
    let isUploadedImage = false;
    
    if (isVercelEnvironment) {
      // 在Vercel环境中，必须使用飞书URL，不能使用本地URL
      if (!imageUrl.includes('open.feishu.cn')) {
        return NextResponse.json({
          success: false,
          error: {
            code: "INVALID_URL_IN_VERCEL",
            message: "在Vercel环境中只能使用飞书URL"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 从飞书URL中提取图片ID
      try {
        console.log(`尝试从飞书URL提取图片ID: ${imageUrl}`);
        
        // 处理特殊格式的图片ID
        // 检查是否是已知的图片ID格式，例如 img_v3_02kk_XXXX
        if (imageUrl.includes('img_v3_')) {
          const matches = imageUrl.match(/img_v3_[\w-]+/);
          if (matches && matches[0]) {
            currentImageId = matches[0];
            console.log(`从图片URL中直接提取到ID: ${currentImageId}`);
            
            // 从飞书获取图片记录
            const imageRecord = await getImageRecordById(currentImageId);
            if (imageRecord && imageRecord.fileToken) {
              console.log(`成功获取图片记录: ${JSON.stringify(imageRecord)}`);
              parentId = imageRecord.parentId || currentImageId;
              isUploadedImage = imageRecord.type === "uploaded";
            } else {
              console.log(`未找到图片ID的记录: ${currentImageId}`);
            }
            
            // 如果找到了ID就跳过其他提取方法
            if (imageRecord && imageRecord.fileToken) {
              console.log(`已找到有效记录，跳过其他提取方法`);
              return;
            }
          }
        }
        
        // 尝试从飞书获取图片记录
        // 假设 URL格式为 https://open.feishu.cn/...?id=xxx 或者包含在某个路径中
        const urlObj = new URL(imageUrl);
        const idFromQuery = urlObj.searchParams.get('id');
        
        if (idFromQuery) {
          currentImageId = idFromQuery;
          console.log(`从URL查询参数中提取到ID: ${currentImageId}`);
          
          // 从飞书获取图片记录
          const imageRecord = await getImageRecordById(currentImageId);
          if (imageRecord && imageRecord.fileToken) {
            console.log(`成功获取图片记录: ${JSON.stringify(imageRecord)}`);
            parentId = imageRecord.parentId || currentImageId;
            isUploadedImage = imageRecord.type === "uploaded";
          } else {
            console.log(`未找到图片ID的记录: ${currentImageId}`);
          }
        } else {
          // 如果URL中没有ID参数，尝试从路径中提取
          const pathParts = urlObj.pathname.split('/');
          
          // 尝试从路径中找到最可能是ID的部分
          for (let i = pathParts.length - 1; i >= 0; i--) {
            const part = pathParts[i];
            if (part && part.length > 8) {
              console.log(`从路径中提取到可能的ID: ${part}`);
              
              // 尝试使用这个部分作为ID
              const imageRecord = await getImageRecordById(part);
              if (imageRecord && imageRecord.fileToken) {
                currentImageId = part;
                console.log(`成功获取图片记录: ${JSON.stringify(imageRecord)}`);
                parentId = imageRecord.parentId || currentImageId;
                isUploadedImage = imageRecord.type === "uploaded";
                break;
              } else {
                console.log(`路径部分不是有效ID: ${part}`);
              }
            }
          }
        }
        
        // 如果仍然没有找到，尝试从整个URL中提取所有可能的ID格式
        if (!currentImageId || !(await getImageRecordById(currentImageId))?.fileToken) {
          console.log(`尝试从整个URL中提取所有可能的ID格式`);
          
          // 尝试匹配UUID格式
          const uuidMatches = imageUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatches && uuidMatches[0]) {
            const potentialId = uuidMatches[0];
            console.log(`从URL中提取到UUID格式的可能 ID: ${potentialId}`);
            
            const imageRecord = await getImageRecordById(potentialId);
            if (imageRecord && imageRecord.fileToken) {
              currentImageId = potentialId;
              console.log(`UUID格式是有效ID: ${currentImageId}`);
              parentId = imageRecord.parentId || currentImageId;
              isUploadedImage = imageRecord.type === "uploaded";
            }
          }
        }
      } catch (err) {
        console.error("从飞书URL提取图片ID失败:", err);
        return NextResponse.json({
          success: false,
          error: {
            code: "FEISHU_URL_PARSE_ERROR",
            message: "无法从飞书URL提取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 如果无法获取图片ID，返回错误
      if (!currentImageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "MISSING_IMAGE_ID",
            message: "无法从飞书URL获取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 验证图片ID是否有效（是否能获取到有效的fileToken）
      const imageRecord = await getImageRecordById(currentImageId);
      if (!imageRecord || !imageRecord.fileToken) {
        console.error(`图片ID无效，无法获取fileToken: ${currentImageId}`);
        return NextResponse.json({
          success: false,
          error: {
            code: "INVALID_IMAGE_ID",
            message: `无法获取图片记录或fileToken: ${currentImageId}`
          }
        } as ApiResponse, { status: 400 });
      }
    } else {
      // 本地环境，使用原来的逻辑
      currentImageId = await getImageIdFromUrl(imageUrl);
      
      // 检查当前图片的原始父ID
      parentId = currentImageId; // 默认使用当前图片ID作为parentId
      
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
    }
    
    console.log("图片类型检查:", { imageUrl, currentImageId, parentId, isUploadedImage, isVercelEnv: isVercelEnvironment });
    
    // 在Vercel环境中，使用飞书API直接获取图片数据
    let imageData: string;
    let mimeType: string;
    
    try {
      if (isVercelEnvironment && imageUrl.includes('open.feishu.cn') && currentImageId) {
        console.log(`在Vercel环境中使用飞书API获取图片数据, ID: ${currentImageId}`);
        
        // 获取图片记录 - 这里不需要再次获取，因为我们已经在前面验证了记录的有效性
        const imageRecord = await getImageRecordById(currentImageId);
        
        // 这里应该不会出现空记录，因为我们已经验证过了，但以防万一还是再次检查
        if (!imageRecord || !imageRecord.fileToken) {
          throw new Error(`无法获取图片记录或fileToken: ${currentImageId}`);
        }
        
        // 获取访问令牌
        const token = await getAccessToken();
        
        // 使用飞书API直接获取图片数据
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
        imageData = buffer.toString('base64');
        mimeType = response.headers.get('content-type') || 'image/jpeg';
      } else {
        // 使用原来的方式获取图片数据
        const result = await fetchImageFromUrl(imageUrl);
        imageData = result.data;
        mimeType = result.mimeType;
      }
    } catch (error) {
      console.error('获取图片数据失败:', error);
      return NextResponse.json({
        success: false,
        error: {
          code: "IMAGE_FETCH_FAILED",
          message: `获取图片数据失败: ${error instanceof Error ? error.message : '未知错误'}`
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
        rootParentId: parentId,  // 增加rootParentId继承，确保编辑链不断裂
        isVercelEnv: isVercelEnvironment  // 传递Vercel环境标志
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
        imageUrl: isVercelEnvironment ? metadata.feishuUrl : metadata.url,  // 在Vercel环境中返回飞书URL
        description: textResponse,
        metadata,
        isVercelEnv: isVercelEnvironment  // 返回Vercel环境标志
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