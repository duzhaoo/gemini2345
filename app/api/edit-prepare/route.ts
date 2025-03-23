import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";
import { getImageRecordById, getAccessToken } from "@/lib/feishu";

// 从原有的edit API复用提取图片ID的函数
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
 * 从飞书API获取图片数据并返回必要的信息
 * 但不包含实际的图片数据，只返回元数据
 */
async function getImageMetadataFromFeishu(imageId: string) {
  console.log(`从飞书获取图片元数据, ID: ${imageId}`);
  
  // 获取图片记录
  const imageRecord = await getImageRecordById(imageId);
  if (!imageRecord || !imageRecord.fileToken) {
    throw new Error(`无法获取图片记录或fileToken: ${imageId}`);
  }
  
  return {
    id: imageRecord.id,
    fileToken: imageRecord.fileToken,
    rootParentId: imageRecord.rootParentId,
    isUploadedImage: imageRecord.type === "uploaded"
  };
}

export async function POST(req: NextRequest) {
  try {
    // 解析请求数据
    const { imageUrl } = await req.json();

    // 验证必要参数
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
          code: "INVALID_URL",
          message: "只支持飞书图片URL"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 从飞书URL提取图片ID
      const imageId = await extractImageIdFromUrl(imageUrl);
      
      if (!imageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "MISSING_IMAGE_ID",
            message: "无法从飞书URL获取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 获取图片元数据
      const imageMetadata = await getImageMetadataFromFeishu(imageId);
      
      // 返回准备结果
      return NextResponse.json({
        success: true,
        data: {
          prepareId: imageMetadata.id,
          fileToken: imageMetadata.fileToken,
          rootParentId: imageMetadata.rootParentId,
          isUploadedImage: imageMetadata.isUploadedImage,
          originalUrl: imageUrl
        }
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`准备编辑图片失败:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: "PREPARATION_FAILED",
          message: "准备编辑图片失败",
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
