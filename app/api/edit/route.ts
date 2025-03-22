import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiResponse } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";
import { getImageRecordById, getAccessToken, getImageRecords } from "@/lib/feishu";

// Initialize the Google Gen AI client with your API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the model ID for Gemini 2.0 Flash experimental
const MODEL_ID = "gemini-2.0-flash-exp";

export async function POST(req: NextRequest) {
  try {
    console.log(`编辑图片API - 请求开始处理`);
    console.log(`编辑图片API - 当前环境: Vercel`);
    
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
    let metadata: any = null;

    
    // 必须使用飞书URL，不能使用本地URL
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
        let foundValidImageRecord = false; // 标记是否找到有效记录
        
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
              foundValidImageRecord = true; // 设置标记为已找到
            } else {
              console.log(`未找到图片ID的记录: ${currentImageId}`);
            }
          }
        }
        
        // 如果已经找到有效记录，跳过后续提取方法
        if (foundValidImageRecord) {
          console.log(`已找到有效记录，跳过其他提取方法`);
        } else {
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
              console.log(`从 URL中提取到UUID格式的可能 ID: ${potentialId}`);
              
              const imageRecord = await getImageRecordById(potentialId);
              if (imageRecord && imageRecord.fileToken) {
                currentImageId = potentialId;
                console.log(`UUID格式是有效ID: ${currentImageId}`);
                parentId = imageRecord.parentId || currentImageId;
                isUploadedImage = imageRecord.type === "uploaded";
              }
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
        let imageRecord = await getImageRecordById(currentImageId);
        
        // 如果无法获取图片记录或fileToken，尝试从飞书获取所有图片记录并查找最匹配的
        if (!imageRecord || !imageRecord.fileToken) {
          console.log(`尝试从飞书获取所有图片记录并查找最匹配的`);
          
          try {
            // 从飞书获取所有图片记录
            const { getImageRecords } = require("@/lib/feishu");
            const allRecords = await getImageRecords();
            
            if (allRecords && allRecords.length > 0) {
              console.log(`成功从飞书获取到 ${allRecords.length} 条记录`);
              
              // 尝试查找最匹配的记录
              // 1. 先尝试完全匹配
              let matchedRecord = allRecords.find(record => 
                record.id === currentImageId || 
                record.id.includes(currentImageId) || 
                currentImageId.includes(record.id)
              );
              
              // 2. 如果没有完全匹配，尝试部分匹配
              if (!matchedRecord) {
                // 尝试匹配UUID部分
                const uuidPart = currentImageId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                if (uuidPart && uuidPart[0]) {
                  matchedRecord = allRecords.find(record => 
                    record.id.includes(uuidPart[0]) || 
                    (record.fileToken && record.fileToken.includes(uuidPart[0]))
                  );
                }
              }
              
              // 3. 如果还是没有匹配，尝试匹配最相似的记录
              if (!matchedRecord) {
                // 尝试匹配最相似的记录（基于ID的相似度）
                let bestMatchScore = 0;
                let bestMatch = null;
                
                for (const record of allRecords) {
                  if (record.fileToken) {
                    // 计算相似度分数
                    let score = 0;
                    const id1 = currentImageId.toLowerCase();
                    const id2 = record.id.toLowerCase();
                    
                    // 计算共同字符数
                    for (let i = 0; i < id1.length; i++) {
                      if (id2.includes(id1[i])) score++;
                    }
                    
                    // 如果分数超过当前最佳匹配，更新最佳匹配
                    if (score > bestMatchScore) {
                      bestMatchScore = score;
                      bestMatch = record;
                    }
                  }
                }
                
                // 如果最佳匹配分数超过阈值，使用该记录
                if (bestMatchScore > 5 && bestMatch) {
                  matchedRecord = bestMatch;
                  console.log(`找到最佳匹配记录，分数: ${bestMatchScore}, ID: ${matchedRecord.id}`);
                }
              }
              
              // 如果找到了匹配的记录，使用该记录
              if (matchedRecord && matchedRecord.fileToken) {
                console.log(`找到匹配的记录: ${JSON.stringify(matchedRecord)}`);
                imageRecord = matchedRecord;
                currentImageId = matchedRecord.id;
                parentId = matchedRecord.parentId || currentImageId;
                isUploadedImage = matchedRecord.type === "uploaded";
              }
            }
          } catch (err) {
            console.error(`获取所有图片记录时出错:`, err);
          }
        }
        
        // 如果仍然无法获取有效的图片记录，返回错误
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
        
        // 将验证后的图片记录保存到变量中，供后续使用
        const validatedImageRecord = imageRecord;
        
        // 使用当前图片ID作为parentId
        parentId = currentImageId;
        isUploadedImage = false;
        
        console.log("图片类型检查:", { imageUrl, currentImageId, parentId, isUploadedImage });
        
        // 使用飞书API直接获取图片数据
        let imageData: string;
        let mimeType: string;
    
    try {
      if (imageUrl.includes('open.feishu.cn') && currentImageId) {
        console.log(`在Vercel环境中使用飞书API获取图片数据, ID: ${currentImageId}`);
        
        // 获取图片记录，如果前面没有定义validatedImageRecord，则重新获取
        const imageRecord = await getImageRecordById(currentImageId);
        
        // 验证图片记录的有效性
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
        // 如果不是飞书URL，直接从原始URL获取图片数据
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          throw new Error(`从原始URL获取图片数据失败: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        imageData = buffer.toString('base64');
        mimeType = response.headers.get('content-type') || 'image/jpeg';
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
        // 使用try-catch包裹API调用，确保错误被正确捕获
        try {
          result = await model.generateContent(messageParts as any);
          console.log(`编辑图片API调用成功`);
          break; // 成功则跳出循环
        } catch (apiError: any) {
          console.error(`Gemini API调用错误:`, apiError);
          throw apiError; // 将错误传递给外层catch
        }
      } catch (error: any) {
        retryCount++;
        
        // 判断是否是速率限制错误
        if (error.message && error.message.includes("Rate limit") && retryCount <= maxRetries) {
          console.log(`速率限制错误，等待 ${retryDelay * retryCount}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount)); // 等待时间逐次增加
          continue;
        }
        
        // 如果是其他错误或者已经超过最大重试次数
        if (retryCount > maxRetries) {
          console.error(`超过最大重试次数，放弃重试`);
          return NextResponse.json({
            success: false,
            error: {
              code: "API_CALL_FAILED",
              message: "调用图片编辑API失败",
              details: error instanceof Error ? error.message : String(error)
            }
          } as ApiResponse, { status: 500 });
        }
        
        console.error(`编辑图片错误, 将在第${retryCount+1}次重试:`, error);
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

    // 初始化变量
    let textResponse: string | null = null;
    let generatedImageData: string | null = null;
    let responseMimeType = "image/png";
    metadata = null;

    // Process the response
    try {
      if (response && response.candidates && response.candidates.length > 0 && 
          response.candidates[0].content && response.candidates[0].content.parts) {
        const parts = response.candidates[0].content.parts;
        console.log(`成功获取响应，包含 ${parts.length} 个部分`);
        
        for (const part of parts) {
          if (part && "inlineData" in part && part.inlineData) {
            // Get the image data
            generatedImageData = part.inlineData.data;
            responseMimeType = part.inlineData.mimeType || "image/png";
            console.log(`获取到图片数据，类型: ${responseMimeType}`);
          } else if (part && "text" in part && part.text) {
            // Store the text
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
      return NextResponse.json({
        success: false,
        error: {
          code: "RESPONSE_PARSE_ERROR",
          message: "解析API响应时发生错误",
          details: parseError instanceof Error ? parseError.message : String(parseError)
        }
      } as ApiResponse, { status: 500 });
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
    
    // 如果有parentId和metadata，保存编辑历史
    if (parentId && metadata && metadata.id) {
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
        
        // 增加错误处理，防止JSON解析错误
        if (historyResponse.ok) {
          try {
            const responseText = await historyResponse.text();
            if (responseText && responseText.trim()) {
              try {
                const historyResult = JSON.parse(responseText);
                console.log('编辑历史记录保存结果:', historyResult);
              } catch (parseError) {
                console.error('解析编辑历史响应JSON失败:', parseError, '原始响应:', responseText);
              }
            } else {
              console.warn('编辑历史API返回空响应');
            }
          } catch (textError) {
            console.error('获取编辑历史响应文本失败:', textError);
          }
        } else {
          console.error('编辑历史API返回错误状态:', historyResponse.status, historyResponse.statusText);
        }
      } catch (historyError) {
        // 记录错误但不中断主流程
        console.error('保存编辑历史记录失败:', historyError);
      }
    }

    // 定义响应变量
    let responseData = {
      success: true,
      data: {
        imageUrl: metadata?.feishuUrl ? metadata.feishuUrl : metadata?.url || '',
        description: textResponse || null,
        metadata: metadata || {},
        isVercelEnv: true  // 返回Vercel环境标志
      }
    } as ApiResponse;
    
    // Return the image URL, description, and metadata as JSON
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error editing image:", error);
    
    // 检查是否是JSON解析错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Unexpected end of JSON input') || errorMessage.includes('JSON')) {
      return NextResponse.json({
        success: false,
        error: {
          code: "JSON_PARSE_ERROR",
          message: "响应数据解析错误，请重试",
          details: errorMessage
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 返回更详细的错误信息，帮助调试
    return NextResponse.json({
      success: false,
      error: {
        code: "EDIT_FAILED",
        message: "图片编辑失败",
        details: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }
    } as ApiResponse, { status: 500 });
  }
}