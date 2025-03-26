"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { Upload, ImageIcon, Loader2, Save, CheckCircle } from "lucide-react";

interface ImageEditorFormProps {
  onImageEdited?: (imageUrl: string, imageId?: string, parentId?: string, rootParentId?: string) => void;
  initialImageUrl?: string;
  readOnlyUrl?: boolean;
  originalImageId?: string;  // 当前选中的图片ID（注意：变量名称有误导性，实际上是当前选中的图片ID）
  rootParentId?: string;     // 根父级ID
}

export function ImageEditorForm({ 
  onImageEdited, 
  initialImageUrl = "", 
  readOnlyUrl = false,
  originalImageId,
  rootParentId
}: ImageEditorFormProps) {
  // 基本状态
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 编辑状态
  const [prepareData, setPrepareData] = useState<{
    prepareId: string;
    fileToken: string;
    parentId?: string;     // 添加parentId属性，用于保持对已编辑过的图片再次编辑时parentId一致
    rootParentId?: string;
    isUploadedImage: boolean;
    originalUrl: string;
  } | null>(null);
  
  // 编辑后的图片数据
  const [editedImageData, setEditedImageData] = useState<{
    imageData: string;
    mimeType: string;
    id: string;
    fileToken: string;
    prepareId: string;
    parentId?: string;     // 添加parentId属性，用于保持对已编辑过的图片再次编辑时parentId一致
    rootParentId?: string;
    isUploadedImage: boolean;
  } | null>(null);
  
  // 保存到飞书状态
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Update imageUrl when initialImageUrl changes
  useEffect(() => {
    if (initialImageUrl) {
      setImageUrl(initialImageUrl);
      setPreviewUrl(initialImageUrl);
    }
  }, [initialImageUrl]);

  // 清理预览URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        // 创建预览
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setImageUrl(''); // 清空URL输入，因为用户选择了上传的文件
        setError(null);
      } else {
        setError('请选择有效的图片文件（JPEG、PNG等）');
        setSelectedFile(null);
      }
    }
  };

  // 触发文件选择
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  // 处理编辑流程（单步操作）
  const handleEdit = async () => {
    // 检查是否有图像来源和编辑指令
    if (!imageUrl && !selectedFile) {
      setError("请上传图片或输入图像网址");
      return;
    }
    
    if (!prompt.trim()) {
      setError("请输入编辑指令");
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsSaved(false); // 重置保存状态
    setEditedImageData(null); // 清除之前的编辑数据

    try {
      let prepareUrl = imageUrl;
      
      // 添加详细的日志输出，便于调试
      console.log(`开始编辑图片，当前参数:`);
      console.log(`  当前选中的图片ID: ${originalImageId || '无'}`);
      console.log(`  根父级ID: ${rootParentId || '无'}`);
      console.log(`  图片URL: ${prepareUrl || '使用上传的文件'}`);
      console.log(`  编辑指令: ${prompt}`);
      
      // 第一步: 如果有上传的文件，先上传图片
      if (selectedFile) {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', "用户上传的原始图片"); // 添加固定提示词
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error?.message || "上传图片失败");
        }
        
        const uploadData = await uploadResponse.json();
        prepareUrl = uploadData.data?.imageUrl;
        
        if (!prepareUrl) {
          throw new Error("上传图片后未返回有效的URL");
        }
      }
      
      // 第二步: 准备图片
      const prepareResponse = await fetch("/api/edit-prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          imageUrl: prepareUrl,
          originalImageId: originalImageId, // 传递当前选中的图片ID（如果有）
          rootParentId: rootParentId       // 传递根父级ID（如果有）
        }),
      });
      
      const prepareResult = await prepareResponse.json();
      
      if (!prepareResponse.ok) {
        throw new Error(prepareResult.error?.message || "准备编辑图像失败");
      }
      
      // 保存准备数据
      const prepareData = prepareResult.data;
      console.log(`准备成功，获取到的数据:`);
      console.log(`  prepareId: ${prepareData.prepareId}`);
      console.log(`  fileToken: ${prepareData.fileToken}`);
      console.log(`  parentId: ${prepareData.parentId || '无'}`);
      console.log(`  rootParentId: ${prepareData.rootParentId || '无'}`);
      
      // 第三步: 执行编辑
    
      console.log(`准备发送执行编辑请求，参数:`);
      console.log(`  prompt: ${prompt}`);
      console.log(`  prepareId: ${prepareData.prepareId}`);
      console.log(`  fileToken: ${prepareData.fileToken}`);
      console.log(`  parentId: ${prepareData.parentId || '无'}`);
      console.log(`  rootParentId: ${prepareData.rootParentId || '无'}`);
      console.log(`  isUploadedImage: ${prepareData.isUploadedImage}`);
      
      const executeResponse = await fetch("/api/edit-execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          prepareId: prepareData.prepareId,
          fileToken: prepareData.fileToken,
          parentId: prepareData.prepareId, // 使用prepareId作为parentId，确保编辑链不会断开
          rootParentId: prepareData.rootParentId,
          isUploadedImage: prepareData.isUploadedImage
        }),
      });
      
      const executeData = await executeResponse.json();
      
      if (!executeResponse.ok) {
        // 检查是否是速率限制错误
        if (executeResponse.status === 429 || (executeData.error?.code === "RATE_LIMIT_EXCEEDED")) {
          throw new Error("超出 API 速率限制，请等待几分钟后再试。");
        } else {
          throw new Error(executeData.error?.message || "编辑图像失败");
        }
      }
      
      // 保存编辑后的图片数据
      if (executeData.data?.imageData) {
        // 设置编辑后的图片数据
        setEditedImageData({
          imageData: executeData.data.imageData,
          mimeType: executeData.data.mimeType,
          id: executeData.data.id,
          fileToken: executeData.data.fileToken,
          prepareId: executeData.data.prepareId,
          parentId: executeData.data.parentId, // 添加parentId属性，确保对已编辑过的图片再次编辑时parentId一致
          rootParentId: executeData.data.rootParentId,
          isUploadedImage: executeData.data.isUploadedImage
        });
        
        // 创建base64 URL用于预览
        const dataUrl = `data:${executeData.data.mimeType};base64,${executeData.data.imageData}`;
        setPreviewUrl(dataUrl);
        
        // 如果有回调函数，调用它，并传递图片ID信息
        if (onImageEdited) {
          // 添加详细的日志，便于调试图片ID传递
          console.log(`图片编辑完成，准备调用onImageEdited回调函数:`);
          console.log(`  新图片ID: ${executeData.data.id}`);
          console.log(`  父级ID: ${executeData.data.parentId}`);
          console.log(`  根父级ID: ${executeData.data.rootParentId}`);
          
          onImageEdited(
            dataUrl,
            executeData.data.id,        // 新图片ID
            executeData.data.parentId,  // 父级ID（当前选中的图片ID）
            executeData.data.rootParentId // 根父级ID
          );
        }
      } else {
        throw new Error("未能获取编辑后的图片数据");
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行过程中发生错误");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 下载图片函数
  const downloadImage = () => {
    if (!editedImageData) return;
    
    try {
      // 创建正确的data URL
      const dataUrl = `data:${editedImageData.mimeType};base64,${editedImageData.imageData}`;
      
      // 创建一个链接元素
      const link = document.createElement('a');
      link.href = dataUrl;
      
      // 生成文件名，使用当前时间戳
      const timestamp = new Date().getTime();
      const extension = editedImageData.mimeType.split('/')[1] || 'png';
      link.download = `gemini-edited-${timestamp}.${extension}`;
      
      // 模拟点击事件触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('图片下载成功');
    } catch (error) {
      console.error('下载图片时出错:', error);
      setError('下载图片失败，请重试');
    }
  };
  
  // 保存到飞书
  const handleSaveToFeishu = async () => {
    if (!editedImageData) {
      setError("没有可保存的图片数据");
      return;
    }
    
    // 先触发下载
    downloadImage();
    
    setIsSaving(true);
    setError(null);
    
    try {
      // 调用保存到飞书API
      const saveResponse = await fetch("/api/save-to-feishu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageData: editedImageData.imageData,
          mimeType: editedImageData.mimeType,
          prompt: prompt,
          prepareId: editedImageData.prepareId,
          parentId: editedImageData.parentId, // 传递parentId参数，确保对已编辑过的图片再次编辑时保持parentId一致
          rootParentId: editedImageData.rootParentId,
          isUploadedImage: editedImageData.isUploadedImage
        }),
      });
      
      const saveData = await saveResponse.json();
      
      if (!saveResponse.ok) {
        throw new Error(saveData.error?.message || "保存到飞书失败");
      }
      
      // 检查是否有警告信息
      if (saveData.warning) {
        console.warn(`保存警告: ${saveData.warning}`);
      }
      
      // 标记为已保存
      setIsSaved(true);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存到飞书过程中发生错误");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full shadow-md border-0">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg pb-2">
        <CardTitle className="text-xl font-bold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          编辑图像
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid w-full gap-4">
          <div className="flex flex-col space-y-2">
            {readOnlyUrl ? (
                <>
                  <Label className="text-sm font-medium text-gray-700">使用图像</Label>
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-gray-50 shadow-inner">
                    {previewUrl && (
                      <img
                        src={previewUrl.startsWith('https://open.feishu.cn') 
                          ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                          : previewUrl}
                        alt="要编辑的图像" 
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={(e) => {
                          console.error('图片加载失败:', previewUrl);
                          e.currentTarget.src = '/placeholder-image.svg';
                        }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 italic">
                    正在使用您刚才生成的图像进行编辑。
                  </p>
                </>
              ) : (
                <>
                  <Label className="text-sm font-medium text-gray-700">选择图像</Label>
                  <div className="grid gap-2">
                    {/* 图片预览区域 */}
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-lg border border-dashed border-purple-300 flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
                      onClick={handleSelectFileClick}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl.startsWith('https://open.feishu.cn') 
                            ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                            : previewUrl}
                          alt="要编辑的图像" 
                          className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('图片加载失败:', previewUrl);
                            e.currentTarget.src = '/placeholder-image.svg';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4">
                          <ImageIcon className="h-12 w-12 mb-3 text-purple-500 opacity-70" />
                          <p className="text-md font-medium text-purple-600 border border-purple-300 rounded-full px-4 py-1 bg-purple-50 hover:bg-purple-100 transition-colors duration-200 shadow-sm">点击选择图片</p>
                        </div>
                      )}
                    </div>
                    
                    {/* 隐藏的文件输入 */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    {/* 隐藏图片URL输入 */}
                    <div className="hidden">
                      <Input
                        type="text"
                        placeholder="或输入图片URL..."
                        value={imageUrl}
                        onChange={(e) => {
                          setImageUrl(e.target.value);
                          setSelectedFile(null);
                          setPreviewUrl(e.target.value || null);
                          // 重置准备数据
                          setPrepareData(null);
                        }}
                        disabled={isLoading}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            
            {/* 编辑指令输入框 */}
            <div className="flex flex-col space-y-2 mt-4">
              <Label htmlFor="prompt" className="text-sm font-medium text-gray-700">编辑指令</Label>
              <Textarea
                id="prompt"
                placeholder="请描述您想要如何编辑图像..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] border-gray-300 focus:border-purple-500 focus:ring-purple-500 rounded-md resize-none"
                disabled={isLoading}
              />
            </div>
            
            {error && (
              <div className="text-sm text-red-500 rounded-lg p-3 bg-red-50 border border-red-200 mt-2 animate-in fade-in">
                <p className="font-semibold flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  错误：
                </p>
                <p>{error}</p>
                {error.includes('速率限制') && (
                  <p className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded">提示：如果您频繁遇到速率限制，可以尝试稍后再试。</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="bg-gray-50 rounded-b-lg pt-2 flex flex-col gap-2">
          <Button 
            type="button" 
            onClick={handleEdit} 
            disabled={isLoading || (!imageUrl && !selectedFile) || !prompt.trim()} 
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2 rounded-md transition-all duration-200 shadow-sm"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                正在编辑...
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                编辑图片
              </span>
            )}
          </Button>
          
          {/* 保存到飞书按钮 */}
          {editedImageData && (
                <Button 
                  type="button" 
                  onClick={handleSaveToFeishu} 
                  disabled={isSaving || isSaved}
                  variant={isSaved ? "outline" : "secondary"}
                  className={`w-full transition-all duration-300 ${isSaved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                >
                  {isSaving ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      保存中...
                    </span>
                  ) : isSaved ? (
                    <span className="flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      已保存
                    </span>
                  ) : (
                    <span className="flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      保存图片
                    </span>
                  )}
                </Button>
              )}
        </CardFooter>
    </Card>
  );
}