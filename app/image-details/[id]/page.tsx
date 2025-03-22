"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Info, Clock, Edit } from "lucide-react";

interface ImageData {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  parentId?: string;
}

interface EditHistoryItem {
  id: string;
  imageId: string;
  prompt: string;
  resultImageId: string;
  createdAt: string;
}

export default function ImageDetailPage({ params }: { params: { id: string } }) {
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [uploadedImage, setUploadedImage] = useState<ImageData | null>(null);
  const [edits, setEdits] = useState<ImageData[]>([]);
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImageDetails = async () => {
      setIsLoading(true);
      try {
        // 使用新的API端点获取图片历史
        console.log(`开始加载图片 ID: ${params.id} 的详情`);
        const response = await fetch(`/api/image-history/${params.id}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API响应错误 (${response.status}):`, errorText);
          throw new Error(`获取图片失败: ${response.statusText}`);
        }
        
        // 记录原始响应
        const data = await response.json();
        console.log("API 原始响应:", data);
        
        if (!data.success) {
          throw new Error(data.error?.message || "获取图片失败");
        }
        
        const { originalImage, edits: editImages, uploadedImage } = data.data;
        console.log("原始图片:", originalImage);
        console.log("编辑记录:", editImages, `(共${editImages.length}条)`);
        console.log("上传的图片:", uploadedImage);
        
        setOriginalImage(originalImage);
        setEdits(editImages || []);
        
        // 如果有上传的图片，设置它
        if (uploadedImage) {
          setUploadedImage(uploadedImage);
        }
        
        // 获取编辑历史记录
        try {
          const historyResponse = await fetch(`/api/edit-history/${params.id}`);
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            console.log("编辑历史记录:", historyData);
            
            if (historyData.success && historyData.data && historyData.data.history) {
              setEditHistory(historyData.data.history);
            }
          }
        } catch (historyError) {
          console.error("获取编辑历史记录失败:", historyError);
          // 不影响主流程，仍然显示图片
        }
        
      } catch (err) {
        console.error("获取图片详情出错:", err);
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchImageDetails();
    }
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-blue-500 hover:text-blue-700">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回图片广场
          </Link>
        </div>
        <div className="p-8 text-center">加载中...</div>
      </div>
    );
  }

  if (error || !originalImage) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-blue-500 hover:text-blue-700">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回图片广场
          </Link>
        </div>
        <div className="p-8 text-center text-red-500">
          <p>{error || "找不到图片"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center text-blue-500 hover:text-blue-700">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回图片广场
        </Link>
      </div>
      
      <h1 className="text-3xl font-bold mb-8">图片详情</h1>
      
      <div className="space-y-8">
        {/* 详情页使用全宽布局，不限制显示数量 */}
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* 原始图片和提示词 */}
          <div className="space-y-6">
            {/* 原始指令 - 用户头像和消息样式 */}
            <div className="flex items-start gap-3">
              <div className="min-w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-500 text-sm font-bold">用户</span>
              </div>
              <div className="flex-1">
                <p className="text-lg font-medium">{originalImage.prompt}</p>
              </div>
            </div>
            
            {/* 原始图片 - AI头像和消息样式，靠右 */}
            <div className="flex items-start justify-end gap-3">
              <div className="flex-1 max-w-[80%]">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="relative aspect-square w-full max-w-xl mx-auto overflow-hidden rounded-md">
                    {/* 使用原生img标签而不是Next.js Image组件，确保飞书图片通过代理API加载 */}
                    <img
                      src={originalImage.url.startsWith('https://open.feishu.cn') 
                        ? `/api/image-proxy?url=${encodeURIComponent(originalImage.url)}` 
                        : originalImage.url}
                      alt={originalImage.prompt}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        console.error('图片加载失败:', originalImage.url);
                        e.currentTarget.src = '/placeholder-image.svg';
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="min-w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-purple-500 text-sm font-bold">AI</span>
              </div>
            </div>
          </div>
          
          {/* 上传的图片 */}
          {uploadedImage && (
            <div className="space-y-6 mt-8">
              {/* 上传的图片 - 用户头像和消息样式 */}
              <div className="flex items-start gap-3">
                <div className="min-w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-500 text-sm font-bold">用户</span>
                </div>
                <div className="flex-1">
                  <p className="text-lg font-medium">{uploadedImage.prompt}</p>
                </div>
              </div>
              
              {/* 上传的图片 - AI头像和消息样式，靠右 */}
              <div className="flex items-start justify-end gap-3">
                <div className="flex-1 max-w-[80%]">
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="relative aspect-square w-full max-w-xl mx-auto overflow-hidden rounded-md">
                      <img
                        src={uploadedImage.url.startsWith('https://open.feishu.cn') 
                          ? `/api/image-proxy?url=${encodeURIComponent(uploadedImage.url)}` 
                          : uploadedImage.url}
                        alt={uploadedImage.prompt}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          console.error('图片加载失败:', uploadedImage.url);
                          e.currentTarget.src = '/placeholder-image.svg';
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="min-w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <span className="text-purple-500 text-sm font-bold">AI</span>
                </div>
              </div>
            </div>
          )}
          
          {/* 编辑历史记录 */}
          <div className="mt-8 border-t pt-6">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-blue-500" />
              编辑历史记录
              <span className="text-sm font-normal text-gray-500 ml-2">（{editHistory.length} 条记录）</span>
            </h2>
            
            {editHistory.length > 0 ? (
              <div className="space-y-4">
                {editHistory.map((historyItem, index) => {
                  // 查找对应的编辑结果图片
                  const resultImage = edits.find(edit => edit.id === historyItem.resultImageId);
                  const editDate = new Date(historyItem.createdAt).toLocaleString('zh-CN');
                  
                  return (
                    <div key={historyItem.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:shadow-md transition-shadow duration-200">
                      <div className="absolute -ml-2 mt-2 w-1 h-full bg-blue-200 rounded hidden md:block"></div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <Edit className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">编辑 #{index + 1}</span>
                        </div>
                        <span className="text-sm text-gray-500">{editDate}</span>
                      </div>
                      
                      <div className="mb-3">
                        <span className="text-sm text-gray-700 font-medium">编辑指令：</span>
                        <p className="mt-1 text-gray-800">{historyItem.prompt}</p>
                      </div>
                      
                      {resultImage && (
                        <div className="flex flex-col md:flex-row items-start gap-4">
                          <div className="flex-1">
                            <span className="text-sm text-gray-700 font-medium">编辑结果：</span>
                            <div className="mt-2 relative aspect-square w-full max-w-xs overflow-hidden rounded-md border border-gray-200 shadow-sm group">
                              <img
                                src={resultImage.url.startsWith('https://open.feishu.cn') 
                                  ? `/api/image-proxy?url=${encodeURIComponent(resultImage.url)}` 
                                  : resultImage.url}
                                alt={historyItem.prompt}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                onError={(e) => {
                                  console.error('图片加载失败:', resultImage.url);
                                  e.currentTarget.src = '/placeholder-image.svg';
                                }}
                              />
                              
                              {/* 悬浮工具栏 */}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-white">{new Date(resultImage.createdAt).toLocaleDateString('zh-CN')}</span>
                                  <Link href={`/image-details/${historyItem.resultImageId}`} className="text-white hover:text-blue-200 text-xs inline-flex items-center gap-1 bg-blue-500/70 px-2 py-1 rounded">
                                    <Info className="h-3 w-3" />
                                    查看详情
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex-1 pt-2 md:pt-8">
                            <Link 
                              href={`/image-details/${historyItem.resultImageId}`} 
                              className="text-blue-500 hover:text-blue-700 text-sm inline-flex items-center gap-1 border border-blue-200 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                            >
                              <Info className="h-4 w-4" />
                              查看图片完整详情
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">该图片暂无编辑历史记录</p>
                <p className="text-sm text-gray-400 mt-1">编辑图片时的操作将会记录在这里</p>
              </div>
            )}
          </div>
          
          {/* 所有编辑内容 */}
          {edits.length > 0 && (
            <div className="space-y-6 mt-8 border-t pt-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Edit className="h-5 w-5 text-purple-500" />
                编辑结果展示
                <span className="text-sm font-normal text-gray-500 ml-2">（{edits.length} 张图片）</span>
              </h2>
              
              {edits.map((edit, index) => (
                <div key={edit.id} className="space-y-6 border-t pt-6">
                  
                  {/* 编辑指令 - 用户头像和消息样式 */}
                  <div className="flex items-start gap-3">
                    <div className="min-w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-500 text-sm font-bold">用户</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-medium">{edit.prompt}</p>
                    </div>
                  </div>
                  
                  {/* 编辑结果 - AI头像和消息样式，靠右 */}
                  <div className="flex items-start justify-end gap-3">
                    <div className="flex-1 max-w-[80%]">
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="relative aspect-square w-full max-w-xl mx-auto overflow-hidden rounded-md">
                          <img
                            src={edit.url.startsWith('https://open.feishu.cn') 
                              ? `/api/image-proxy?url=${encodeURIComponent(edit.url)}` 
                              : edit.url}
                            alt={edit.prompt}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              console.error('图片加载失败:', edit.url);
                              e.currentTarget.src = '/placeholder-image.svg';
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="min-w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-purple-500 text-sm font-bold">AI</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
