import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";
import { uploadImageToFeishu, saveImageRecord } from "@/lib/feishu";
import crypto from 'crypto';
import { getAccessToken } from "@/lib/feishu";

/**
 * 将图片保存到飞书
 * 接收base64图片数据，上传到飞书并保存记录
 */
export async function POST(req: NextRequest) {
  try {
    // 解析请求数据
    const { 
      imageData, 
      mimeType, 
      prompt, 
      prepareId, 
      parentId, // 添加parentId参数
      rootParentId, 
      isUploadedImage,
      // 添加可能的额外元数据
      additionalMetadata = {}
    } = await req.json();

    // 验证必要参数
    if (!imageData) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_DATA",
          message: "缺少图片数据"
        }
      } as ApiResponse, { status: 400 });
    }

    if (!mimeType) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_MIME_TYPE",
          message: "缺少图片MIME类型"
        }
      } as ApiResponse, { status: 400 });
    }

    try {
      // 生成唯一ID
      const id = crypto.randomUUID();
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `${id}.${extension}`;
      
      console.log("开始上传图片到飞书...");
      
      // 上传图片到飞书
      const fileInfo = await uploadImageToFeishu(
        imageData,
        filename,
        mimeType
      );
      
      if (fileInfo.error) {
        throw new Error(`上传图片到飞书失败: ${fileInfo.errorMessage}`);
      }
      
      console.log(`图片已上传到飞书，URL: ${fileInfo.url}`);
      
      // 保存记录到飞书多维表格
      console.log("开始保存记录到飞书多维表格...");
      
      // 判断是原始图片还是编辑后的图片
      let actualParentId = id; // 默认使用自身 ID
      let actualRootParentId = id; // 默认使用自身 ID
      
      // 输出详细的日志，便于调试
      console.log(`保存图片到飞书，接收到的参数: id=${id}, prepareId=${prepareId}, parentId=${parentId}, rootParentId=${rootParentId}`);
      
      // 如果是编辑后的图片
      if (prepareId) {
        // 优先使用传入的parentId，如果没有才使用prepareId
        // 这里的parentId应该是当前选中的图片ID，而不是原始图片ID
        if (parentId) {
          actualParentId = parentId;
          console.log(`使用传入的parentId: ${parentId}`);
        } else {
          actualParentId = prepareId;
          console.log(`没有传入parentId，使用prepareId作为parentId: ${prepareId}`);
        }
        
        // 优先使用传入的rootParentId，如果没有才使用prepareId
        if (rootParentId) {
          actualRootParentId = rootParentId;
          console.log(`使用传入的rootParentId: ${rootParentId}`);
        } else {
          actualRootParentId = prepareId;
          console.log(`没有传入rootParentId，使用prepareId作为rootParentId: ${prepareId}`);
        }
        
        console.log(`编辑后图片ID设置：id=${id}, parentId=${actualParentId}, rootParentId=${actualRootParentId}`);
      } else {
        console.log(`原始图片ID设置：id=${id}, parentId=${id}, rootParentId=${id}`);
      }
      
      // 构建要保存的元数据，确保与飞书多维表格字段一致
      const metadata = {
        id,
        url: fileInfo.url,
        fileToken: fileInfo.fileToken,
        prompt: prompt || "编辑的图片",
        timestamp: String(new Date().getTime()),  // 确保timestamp是字符串类型
        parentId: actualParentId,  // 使用实际的parentId
        rootParentId: actualRootParentId,  // 使用实际的rootParentId
        type: isUploadedImage === true ? "uploaded" : "generated"
      };
      
      const recordInfo = await saveImageRecord(metadata);
      
      if (recordInfo.error) {
        console.error(`保存记录到飞书失败: ${recordInfo.errorMessage}`);
        // 即使保存记录失败，我们仍然返回成功，因为图片已经上传成功
        return NextResponse.json({
          success: true,
          message: "图片已上传到飞书，但保存记录失败",
          warning: recordInfo.errorMessage
        } as ApiResponse);
      }
      
      console.log(`记录已保存到飞书，record_id: ${recordInfo.record_id}`);
      
      // 返回简单的成功响应
      return NextResponse.json({
        success: true,
        message: "图片已成功保存到飞书"
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`保存到飞书失败:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: "SAVE_TO_FEISHU_FAILED",
          message: "保存到飞书失败",
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
