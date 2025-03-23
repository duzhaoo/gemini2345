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
      
      // 构建要保存的元数据，确保与飞书多维表格字段一致
      const metadata = {
        id,
        url: fileInfo.url,
        fileToken: fileInfo.fileToken,
        prompt: prompt || "编辑的图片",
        timestamp: String(new Date().getTime()),  // 确保timestamp是字符串类型
        parentId: id,  // 使用图片自身的id作为parentId
        rootParentId: id,  // 使用图片自身的id作为rootParentId
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
