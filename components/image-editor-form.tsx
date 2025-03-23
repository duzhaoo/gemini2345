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
  onImageEdited?: (imageUrl: string) => void;
  initialImageUrl?: string;
  readOnlyUrl?: boolean;
}

export function ImageEditorForm({ 
  onImageEdited, 
  initialImageUrl = "", 
  readOnlyUrl = false 
}: ImageEditorFormProps) {
  // 基本状态
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 两步编辑状态
  const [step, setStep] = useState<'prepare' | 'execute'>('prepare');
  const [prepareData, setPrepareData] = useState<{
    prepareId: string;
    fileToken: string;
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
    rootParentId?: string;
    isUploadedImage: boolean;
  } | null>(null);
  
  // 原始图片和编辑后的图片URL
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  
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

  // 处理准备步骤
  const handlePrepare = async () => {
    // 检查是否有图像来源（URL或上传的文件）
    if (!imageUrl && !selectedFile) {
      setError("请上传图片或输入图像网址");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let prepareUrl = imageUrl;
      
      if (selectedFile) {
        // 如果有上传的文件，先上传图片
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
      
      // 调用准备API
      const prepareResponse = await fetch("/api/edit-prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: prepareUrl }),
      });
      
      const prepareData = await prepareResponse.json();
      
      if (!prepareResponse.ok) {
        throw new Error(prepareData.error?.message || "准备编辑图像失败");
      }
      
      // 保存准备数据并进入下一步
      setPrepareData(prepareData.data);
      // 保存原始图片URL
      setOriginalImageUrl(previewUrl);
      setStep('execute');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "准备过程中发生错误");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 处理执行步骤
  const handleExecute = async () => {
    if (!prompt.trim()) {
      setError("请输入编辑指令");
      return;
    }
    
    if (!prepareData) {
      setError("请先准备图像");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setIsSaved(false); // 重置保存状态
    setEditedImageData(null); // 清除之前的编辑数据
    
    try {
      // 调用执行API
      const executeResponse = await fetch("/api/edit-execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          prepareId: prepareData.prepareId,
          fileToken: prepareData.fileToken,
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
          rootParentId: executeData.data.rootParentId,
          isUploadedImage: executeData.data.isUploadedImage
        });
        
        // 创建base64 URL用于预览
        const dataUrl = `data:${executeData.data.mimeType};base64,${executeData.data.imageData}`;
        // 设置编辑后的图片URL，而不是更新预览URL
        setEditedImageUrl(dataUrl);
        
        // 如果有回调函数，调用它
        if (onImageEdited) {
          onImageEdited(dataUrl);
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
    
    // 创建一个链接元素
    const link = document.createElement('a');
    link.href = editedImageData.imageData;
    
    // 生成文件名，使用当前时间戳
    const timestamp = new Date().getTime();
    const extension = editedImageData.mimeType.split('/')[1] || 'png';
    link.download = `gemini-edited-${timestamp}.${extension}`;
    
    // 模拟点击事件触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle>编辑图像</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid w-full gap-4">
          <div className="flex flex-col space-y-2">
            {readOnlyUrl ? (
                <>
                  <Label>使用图像</Label>
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border">
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
                  <p className="text-xs text-muted-foreground">
                    正在使用您刚才生成的图像进行编辑。
                  </p>
                </>
              ) : (
                <>
                  <Label>选择图像</Label>
                  <div className="grid gap-2">
                    {/* 图片预览区域 - 始终显示原始图片 */}
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-md border border-dashed flex items-center justify-center"
                      onClick={handleSelectFileClick}
                    >
                      {originalImageUrl ? (
                        <img
                          src={originalImageUrl.startsWith('https://open.feishu.cn') 
                            ? `/api/image-proxy?url=${encodeURIComponent(originalImageUrl)}` 
                            : originalImageUrl}
                          alt="原始图像" 
                          className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('图片加载失败:', originalImageUrl);
                            e.currentTarget.src = '/placeholder-image.svg';
                          }}
                        />
                      ) : previewUrl ? (
                        <img
                          src={previewUrl.startsWith('https://open.feishu.cn') 
                            ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                            : previewUrl}
                          alt="原始图像" 
                          className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('图片加载失败:', previewUrl);
                            e.currentTarget.src = '/placeholder-image.svg';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4">
                          <ImageIcon className="h-10 w-10 mb-2 text-primary" />
                          <p className="text-xl font-medium text-primary border border-primary rounded-md px-4 py-2">选择图片</p>
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
                          // 重置步骤和准备数据
                          setStep('prepare');
                          setPrepareData(null);
                        }}
                        disabled={isLoading || step === 'execute'}
                        className="flex-1"
                      />
                    </div>
                    
                    {/* 删除大的上传按钮 */}
                  </div>
                </>
              )}
            </div>
            {/* 隐藏步骤指示器 */}
            <div className="hidden">
              <div className="flex items-center">
                <div className={`rounded-full w-6 h-6 flex items-center justify-center ${step === 'prepare' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  1
                </div>
                <span className="ml-2 text-sm font-medium">准备图片</span>
              </div>
              <Separator className="w-8" />
              <div className="flex items-center">
                <div className={`rounded-full w-6 h-6 flex items-center justify-center ${step === 'execute' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  2
                </div>
                <span className="ml-2 text-sm font-medium">编辑图片</span>
              </div>
            </div>
            
            {/* 编辑指令输入框 */}
            <div className="flex flex-col space-y-2 mt-2">
              <Label htmlFor="prompt">编辑指令</Label>
              <Textarea
                id="prompt"
                placeholder="请描述您想要如何编辑图像..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px]"
                disabled={isLoading || step === 'prepare'}
              />
            </div>
            
            {/* 编辑后的图片显示区域 */}
            {editedImageUrl && (
              <div className="flex flex-col space-y-2 mt-4">
                <Label>编辑后的图片</Label>
                <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                  <img 
                    src={editedImageUrl} 
                    alt="编辑后的图像"
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => {
                      console.error('图片加载失败:', editedImageUrl);
                      e.currentTarget.src = '/placeholder-image.svg';
                    }}
                  />
                </div>
                
                {/* 保存到飞书按钮 */}
                {editedImageData && (
                  <Button 
                    type="button" 
                    onClick={handleSaveToFeishu} 
                    disabled={isSaving || isSaved}
                    variant={isSaved ? "outline" : "secondary"}
                    className="w-full mt-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : isSaved ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        已保存
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        保存图片
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            
            {error && (
              <div className="text-sm text-red-500 rounded p-2 bg-red-50 border border-red-200">
                <p className="font-semibold">错误：</p>
                <p>{error}</p>
                {error.includes('速率限制') && (
                  <p className="mt-2">提示：如果您频繁遇到速率限制，可以尝试稍后再试。</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {step === 'prepare' ? (
            <Button 
              type="button" 
              onClick={handlePrepare} 
              disabled={isLoading || (!imageUrl && !selectedFile)} 
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中...
                </>
              ) : "上传图片"}
            </Button>
          ) : (
            <>
              <Button 
                type="button" 
                onClick={handleExecute} 
                disabled={isLoading || !prompt.trim() || !prepareData} 
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    编辑中...
                  </>
                ) : "执行编辑"}
              </Button>
            </>
          )}
        </CardFooter>
    </Card>
  );
}