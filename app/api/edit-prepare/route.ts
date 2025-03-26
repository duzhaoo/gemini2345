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
      console.log(`获取到图片元数据: ID=${imageId}, fileToken=${imageMetadata.fileToken}, parentId=${imageMetadata.parentId}, rootParentId=${imageMetadata.rootParentId}, type=${imageMetadata.isUploadedImage ? "uploaded" : "generated"}`);
      
      // 不再检查ID是否为UUID格式，因为我们现在使用fileToken作为ID
      // 如果是对已编辑图片再次编辑，使用当前选中的图片作为编辑基础
      // 而不是使用原始图片
      const currentFileToken = imageMetadata.fileToken;
      
      // 当前图片的ID将作为下一个编辑图片的parentId
      let actualParentId = imageId; // 当前图片ID
      
      // 对于rootParentId，默认使用当前图片ID
      let actualRootParentId = imageId;
      
      // 改进rootParentId的处理逻辑
      if (imageMetadata.isUploadedImage) {
        // 如果当前图片是上传图片，则它自身就是rootParentId
        actualRootParentId = imageId;
        console.log(`当前图片是上传图片，使用其ID作为rootParentId: ${imageId}`);
      } else if (imageMetadata.rootParentId) {
        // 如果当前图片不是上传图片，但有rootParentId，则使用它
        actualRootParentId = imageMetadata.rootParentId;
        console.log(`使用已有的rootParentId: ${actualRootParentId}`);
      } else {
        // 如果rootParentId不存在
        console.log(`没有rootParentId，使用当前图片ID: ${imageId}`);
      }
      
      // 检查当前图片的类型，判断是原始上传图片还是生成/编辑图片
      // 注意：使用imageMetadata中的isUploadedImage属性
      const isUploadedImage = imageMetadata.isUploadedImage === true;
      
      // 输出详细的日志，便于调试
      console.log(`准备编辑图片: 当前图片ID=${imageId}, fileToken=${currentFileToken}, 实际parentId=${actualParentId}, 实际rootParentId=${actualRootParentId}, 是否上传图片=${isUploadedImage}`);
      
      
      console.log(`准备编辑图片: 使用当前图片ID=${imageId}, fileToken=${currentFileToken}, parentId=${actualParentId}, rootParentId=${actualRootParentId}`);
      
      // 返回准备结果
      return NextResponse.json({
        success: true,
        data: {
          prepareId: imageId, // 使用当前选中的图片ID作为parentId
          fileToken: currentFileToken, // 使用当前选中的图片的fileToken
          parentId: actualParentId, // 传递当前图片的parentId，确保再次编辑时保持parentId一致
          rootParentId: actualRootParentId, // 保留原始的rootParentId
          isUploadedImage: isUploadedImage, // 使用我们之前定义的isUploadedImage变量
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
