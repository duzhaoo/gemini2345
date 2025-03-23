"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { Upload, ImageIcon, Loader2 } from "lucide-react";

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
      
      // 编辑成功，调用回调函数
      if (onImageEdited && executeData.data?.imageUrl) {
        onImageEdited(executeData.data.imageUrl);
      }
      
      // 重置为准备状态，以便用户可以继续编辑
      setStep('prepare');
      setPrepareData(null);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行过程中发生错误");
    } finally {
      setIsLoading(false);
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
                    {/* 图片预览区域 */}
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-md border border-dashed flex items-center justify-center"
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
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
                          <ImageIcon className="h-10 w-10 mb-2" />
                          <p>点击选择图像或拖放图片到此处</p>
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
                    
                    {/* 图片URL输入 */}
                    <div className="flex gap-2">
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
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleSelectFileClick}
                        disabled={isLoading || step === 'execute'}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* 步骤指示器 */}
            <div className="flex items-center justify-between mt-4 mb-2">
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
        <CardFooter>
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
                  准备中...
                </>
              ) : "准备编辑"}
            </Button>
          ) : (
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
          )}
        </CardFooter>
    </Card>
  );
}