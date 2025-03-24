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
  
  // 添加日志输出图片记录信息，便于调试
  console.log(`获取到图片记录: id=${imageRecord.id}, parentId=${imageRecord.parentId}, rootParentId=${imageRecord.rootParentId}`);
  
  return {
    id: imageRecord.id,
    fileToken: imageRecord.fileToken,
    parentId: imageRecord.parentId, // 返回图片的parentId
    rootParentId: imageRecord.rootParentId,
    isUploadedImage: imageRecord.type === "uploaded"
  };
}

export async function POST(req: NextRequest) {
  try {
    // 解析请求数据
    const requestData = await req.json();
    const { imageUrl, originalImageId, rootParentId } = requestData;

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
    
    // 验证URL类型 - 允许飞书URL或数据缓存URL
    const isFeishuUrl = imageUrl.includes('open.feishu.cn');
    const isDataUrl = imageUrl.startsWith('data:');
    const isApiProxyUrl = imageUrl.includes('/api/image-proxy');
    const isLocalUrl = imageUrl.startsWith('/') && !imageUrl.startsWith('/api/');
    
    if (!isFeishuUrl && !isDataUrl && !isApiProxyUrl && !isLocalUrl) {
      console.log(`不支持的URL类型: ${imageUrl.substring(0, 50)}...`);
      return NextResponse.json({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "不支持的URL类型，请使用飞书图片URL或本地图片"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 处理不同类型的URL
      let imageId = null;
      
      if (isFeishuUrl) {
        // 从飞书URL提取图片ID
        imageId = await extractImageIdFromUrl(imageUrl);
        console.log(`从飞书URL提取的图片ID: ${imageId}`);
      } else if (isApiProxyUrl) {
        // 从代理URL中提取原始URL
        try {
          const urlObj = new URL(imageUrl, 'http://localhost');
          const originalUrl = urlObj.searchParams.get('url');
          if (originalUrl) {
            imageId = await extractImageIdFromUrl(originalUrl);
            console.log(`从代理URL提取的原始URL: ${originalUrl.substring(0, 50)}...`);
            console.log(`从原始URL提取的图片ID: ${imageId}`);
          }
        } catch (err) {
          console.error('解析代理URL失败:', err);
        }
      } else if (isLocalUrl) {
        // 从本地URL提取ID
        const matches = imageUrl.match(/\/images\/([a-zA-Z0-9-]+)\.(png|jpg|jpeg|webp)/i);
        if (matches && matches[1]) {
          imageId = matches[1];
          console.log(`从本地URL提取的图片ID: ${imageId}`);
        }
      } else if (isDataUrl) {
        // 处理数据URL（已编辑图片的预览）
        console.log('检测到数据URL，尝试从请求中提取图片ID');
        
        // 使用之前已解析的请求数据
        // 对于数据URL，我们应该使用originalImageId，即当前选中的图片ID
        // 而不是rootParentId，因为我们要基于当前选中的图片进行编辑
        if (originalImageId) {
          imageId = originalImageId;
          console.log(`使用当前选中的图片ID进行编辑: ${imageId}`);
        } else if (rootParentId) {
          // 只有在没有originalImageId的情况下才使用rootParentId
          imageId = rootParentId;
          console.log(`没有当前选中的图片ID，使用根父级ID: ${imageId}`);
        }
        
        // 如果仍然没有有效的imageId，返回错误
        if (!imageId) {
          console.error('无法从数据URL中提取图片ID，且请求中没有提供有效的originalImageId或rootParentId');
          return NextResponse.json({
            success: false,
            error: {
              code: "MISSING_IMAGE_ID",
              message: "无法从数据URL获取图片ID，请重新上传图片"
            }
          } as ApiResponse, { status: 400 });
        }
      }
      
      if (!imageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "MISSING_IMAGE_ID",
            message: "无法从图片URL获取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 获取图片元数据 - 使用当前选中的图片ID而不是原始图片ID
      const imageMetadata = await getImageMetadataFromFeishu(imageId);
      
      // 输出详细的日志，便于调试
      console.log(`获取到图片元数据: ID=${imageId}, fileToken=${imageMetadata.fileToken}, parentId=${imageMetadata.parentId}, rootParentId=${imageMetadata.rootParentId}`);
      
      // 检查parentId是否看起来像图片ID（UUID格式）而不是fileToken
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidParentId = imageMetadata.parentId && uuidRegex.test(imageMetadata.parentId);
      
      // 如果是对已编辑图片再次编辑，使用当前选中的图片作为编辑基础
      // 而不是使用原始图片
      const currentFileToken = imageMetadata.fileToken;
      
      // 确保使用正确的parentId和rootParentId
      // 如果当前图片是原始图片，则parentId和rootParentId都是当前图片ID
      // 如果当前图片是编辑图片，则保留其parentId和rootParentId
      let actualParentId = imageId; // 默认使用当前图片ID
      
      // 只有当parentId是有效的UUID格式时才使用它
      if (isValidParentId) {
        actualParentId = imageMetadata.parentId;
        console.log(`使用有效的parentId: ${actualParentId}`);
      } else if (imageMetadata.parentId) {
        console.log(`检测到无效的parentId: ${imageMetadata.parentId}，可能是fileToken，改用当前图片ID`);
      }
      
      // 同样检查rootParentId的有效性
      const isValidRootParentId = imageMetadata.rootParentId && uuidRegex.test(imageMetadata.rootParentId);
      let actualRootParentId = imageId; // 默认使用当前图片ID
      
      if (isValidRootParentId) {
        actualRootParentId = imageMetadata.rootParentId;
        console.log(`使用有效的rootParentId: ${actualRootParentId}`);
      } else if (imageMetadata.rootParentId) {
        console.log(`检测到无效的rootParentId: ${imageMetadata.rootParentId}，改用当前图片ID`);
      }
      
      console.log(`准备编辑图片: 使用当前图片ID=${imageId}, fileToken=${currentFileToken}, parentId=${actualParentId}, rootParentId=${actualRootParentId}`);
      
      // 返回准备结果
      return NextResponse.json({
        success: true,
        data: {
          prepareId: imageId, // 使用当前选中的图片ID作为parentId
          fileToken: currentFileToken, // 使用当前选中的图片的fileToken
          parentId: actualParentId, // 传递当前图片的parentId，确保再次编辑时保持parentId一致
          rootParentId: actualRootParentId, // 保留原始的rootParentId
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
