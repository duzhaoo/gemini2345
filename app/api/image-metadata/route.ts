import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { ApiResponse } from "@/lib/types";
import { getImageIdFromUrl } from "@/lib/server-utils";

// 定义元数据目录路径
const metadataDir = path.join(process.cwd(), "data", "metadata");

export async function GET(req: NextRequest) {
  try {
    // 获取URL参数
    const url = new URL(req.url);
    const imagePath = url.searchParams.get("path");

    if (!imagePath) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PATH",
          message: "Image path is required"
        }
      } as ApiResponse, { status: 400 });
    }

    // 检查是否在Vercel环境中
    const isVercelEnvironment = process.env.VERCEL === '1';
    
    // 在Vercel环境中，我们无法从本地文件系统读取元数据
    if (isVercelEnvironment) {
      // 返回一个空响应，前端会处理这种情况
      return NextResponse.json({
        success: false,
        error: {
          code: "VERCEL_ENVIRONMENT",
          message: "Cannot access local metadata in Vercel environment"
        }
      } as ApiResponse, { status: 404 });
    }

    // 从URL中提取图片ID
    const imageId = await getImageIdFromUrl(imagePath);

    if (!imageId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "IMAGE_NOT_FOUND",
          message: "Image not found"
        }
      } as ApiResponse, { status: 404 });
    }

    // 读取元数据文件
    const metadataPath = path.join(metadataDir, `${imageId}.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));

    // 返回元数据
    return NextResponse.json({
      success: true,
      data: metadata
    } as ApiResponse);
  } catch (error) {
    console.error("Error fetching image metadata:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "METADATA_ERROR",
        message: "Failed to fetch image metadata",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
