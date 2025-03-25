"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, Send, ImageIcon, Upload } from "lucide-react";
import Image from "next/image";

// 定义消息类型
type MessageType = "text" | "image" | "loading" | "error";

// 定义消息接口
interface Message {
  id: string;
  type: MessageType;
  content: string;
  sender: "user" | "bot";
  imageUrl?: string;
  imageId?: string;
  parentId?: string;
  rootParentId?: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  onImageGenerated?: (imageUrl: string, imageId?: string) => void;
  onImageEdited?: (imageUrl: string, imageId?: string, parentId?: string, rootParentId?: string) => void;
}

export function ChatInterface({ 
  onImageGenerated, 
  onImageEdited 
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "text",
      content: "你好！我是图像助手。你可以要求我生成新图像或编辑现有图像。例如：\n- \"生成一只在海滩上奔跑的金毛犬\"\n- \"编辑这张图片，将背景改为雪山\"",
      sender: "bot",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [rootParentId, setRootParentId] = useState<string | null>(null);

  // 注释掉自动滚动到底部的功能
  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [messages]);

  // 清理预览URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // 生成唯一ID
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        // 创建预览
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        
        // 添加用户上传图片的消息
        const newMessage: Message = {
          id: generateId(),
          type: "image",
          content: "我上传了一张图片",
          sender: "user",
          imageUrl: url,
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, newMessage]);
      } else {
        // 添加错误消息
        const errorMessage: Message = {
          id: generateId(),
          type: "error",
          content: "请选择有效的图片文件（JPEG、PNG等）",
          sender: "bot",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, errorMessage]);
        setSelectedFile(null);
      }
    }
  };

  // 触发文件选择
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  // 判断是生成还是编辑请求
  const isGenerateRequest = (text: string): boolean => {
    const generateKeywords = ["生成", "创建", "画", "制作", "做", "绘制"];
    return generateKeywords.some(keyword => text.includes(keyword));
  };

  // 处理消息发送
  const handleSendMessage = async () => {
    if (!input.trim() && !selectedFile) return;

    const userMessage: Message = {
      id: generateId(),
      type: "text",
      content: input,
      sender: "user",
      timestamp: new Date()
    };

    // 添加用户消息
    setMessages(prev => [...prev, userMessage]);
    
    // 添加加载消息
    const loadingMessageId = generateId();
    const loadingMessage: Message = {
      id: loadingMessageId,
      type: "loading",
      content: "正在处理...",
      sender: "bot",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, loadingMessage]);
    
    setIsLoading(true);
    setInput("");

    try {
      // 判断是生成还是编辑请求
      const isGenerate = isGenerateRequest(input);
      
      if (isGenerate) {
        // 处理图像生成请求
        await handleGenerateImage(input, loadingMessageId);
      } else if (selectedFile || previewUrl || currentImageId) {
        // 处理图像编辑请求（上传的图片、预览图片或最后一次生成/编辑的图片）
        await handleEditImage(input, loadingMessageId);
      } else {
        // 一般对话，提示用户需要明确指令
        replaceLoadingMessage(loadingMessageId, {
          type: "text",
          content: "请明确指出您想要生成新图像还是编辑现有图像。您也可以上传一张图片进行编辑。",
          sender: "bot"
        });
      }
    } catch (error) {
      // 处理错误
      replaceLoadingMessage(loadingMessageId, {
        type: "error",
        content: error instanceof Error ? error.message : "处理请求时发生错误",
        sender: "bot"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 替换加载消息
  const replaceLoadingMessage = (loadingId: string, newMessage: Partial<Message>) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === loadingId 
          ? { ...msg, ...newMessage, type: newMessage.type || msg.type, timestamp: new Date() } 
          : msg
      )
    );
  };

  // 处理图像生成
  const handleGenerateImage = async (prompt: string, loadingId: string) => {
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 检查是否是速率限制错误
        if (response.status === 429 || (data.error?.code === "RATE_LIMIT_EXCEEDED")) {
          throw new Error("超出 API 速率限制，请等待几分钟后再试。您也可以使用上传图片功能。");
        } else {
          throw new Error(data.error?.message || "生成图像失败");
        }
      }

      if (data.data?.imageUrl) {
        // 获取正确的图片ID
        const imageId = data.data.metadata?.id || data.data.id;
        console.log(`生成图片成功，图片ID: ${imageId}`);
        
        // 更新加载消息为图像消息
        replaceLoadingMessage(loadingId, {
          type: "image",
          content: "已生成图像",
          imageUrl: data.data.imageUrl,
          imageId: imageId, // 使用正确的图片ID
          sender: "bot"
        });

        // 保存当前图片ID和根父级ID
        if (imageId) {
          setCurrentImageId(imageId);
          setRootParentId(imageId); // 对于新生成的图片，rootParentId与当前图片ID相同
          console.log(`已设置当前图片ID: ${imageId}, 根父级ID: ${imageId}`);
        }

        // 调用回调函数
        if (onImageGenerated) {
          onImageGenerated(data.data.imageUrl, data.data.id);
        }
      } else {
        throw new Error("未能获取生成的图片数据");
      }
    } catch (error) {
      throw error;
    }
  };

  // 处理图像编辑
  const handleEditImage = async (prompt: string, loadingId: string) => {
    try {
      let imageUrl = previewUrl;
      let isLastGeneratedImage = false;
      
      // 如果有上传的文件，先上传图片
      if (selectedFile) {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', "用户上传的原始图片");
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error?.message || "上传图片失败");
        }
        
        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.data?.imageUrl;
        
        if (!imageUrl) {
          throw new Error("上传图片后未返回有效的URL");
        }
        
        // 从上传响应中获取图片ID并设置为当前图片ID
        if (uploadData.data?.metadata?.id) {
          const newImageId = uploadData.data.metadata.id;
          console.log(`上传图片成功，获取到ID: ${newImageId}`);
          setCurrentImageId(newImageId);
          // 对于新上传的图片，其自身就是根图片
          setRootParentId(newImageId);
        } else {
          console.error("上传响应中没有图片ID");
        }
      } 
      // 如果没有上传文件或预览URL，但有当前图片ID，则使用最后一次生成/编辑的图片
      else if (!imageUrl && currentImageId) {
        // 查找最后一个图片消息
        const lastImageMessage = [...messages].reverse().find(
          msg => msg.type === 'image' && msg.sender === 'bot' && msg.imageId === currentImageId
        );
        
        if (lastImageMessage && lastImageMessage.imageUrl) {
          imageUrl = lastImageMessage.imageUrl;
          isLastGeneratedImage = true;
          console.log(`继续编辑图片: 使用最后生成/编辑的图片 ID=${currentImageId}`);
        } else {
          throw new Error("找不到最后生成/编辑的图片");
        }
      }
      
      // 准备图片
      const prepareResponse = await fetch("/api/edit-prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          imageUrl,
          originalImageId: currentImageId,
          rootParentId: rootParentId
        }),
      });
      
      const prepareResult = await prepareResponse.json();
      
      if (!prepareResponse.ok) {
        throw new Error(prepareResult.error?.message || "准备编辑图像失败");
      }
      
      // 保存准备数据
      const prepareData = prepareResult.data;
      
      // 执行编辑
      console.log(`准备编辑图片, currentImageId=${currentImageId}, 确保使用正确的parentId`);
      console.log(`prepareData: prepareId=${prepareData.prepareId}, fileToken=${prepareData.fileToken}, rootParentId=${prepareData.rootParentId}`);
      
      // 对于上传图片，确保使用图片ID而不是fileToken作为parentId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidId = currentImageId && uuidRegex.test(currentImageId);
      
      if (!isValidId) {
        console.error(`当前图片ID格式无效: ${currentImageId}`);
      }
      
      const executeResponse = await fetch("/api/edit-execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          prepareId: prepareData.prepareId,
          fileToken: prepareData.fileToken,
          parentId: currentImageId, // 确保使用正确的图片ID作为parentId
          rootParentId: prepareData.rootParentId || currentImageId, // 如果没有rootParentId，则使用当前图片ID
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
      
      // 处理编辑后的图片数据
      if (executeData.data?.imageData) {
        // 创建base64 URL用于预览
        const dataUrl = `data:${executeData.data.mimeType};base64,${executeData.data.imageData}`;
        
        // 更新加载消息为图像消息
        replaceLoadingMessage(loadingId, {
          type: "image",
          content: "已编辑图像",
          imageUrl: dataUrl,
          imageId: executeData.data.id,
          parentId: executeData.data.parentId,
          rootParentId: executeData.data.rootParentId,
          sender: "bot"
        });
        
        // 更新当前图片ID
        if (executeData.data.id) {
          setCurrentImageId(executeData.data.id);
        }
        
        // 处理rootParentId
        if (executeData.data.rootParentId) {
          setRootParentId(executeData.data.rootParentId);
        } else if (executeData.data.parentId && !rootParentId) {
          setRootParentId(executeData.data.parentId);
        }
        
        // 调用回调函数
        if (onImageEdited) {
          onImageEdited(
            dataUrl,
            executeData.data.id,
            executeData.data.parentId,
            executeData.data.rootParentId
          );
        }
        
        // 清除选择的文件和预览
        setSelectedFile(null);
        if (previewUrl && previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(null);
      } else {
        throw new Error("未能获取编辑后的图片数据");
      }
    } catch (error) {
      throw error;
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="w-full h-[80vh] flex flex-col">
      <CardContent className="flex-grow overflow-auto p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}
              >
                {message.type === 'text' && (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
                
                {message.type === 'image' && (
                  <div className="space-y-2">
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    <div className="relative aspect-video w-full overflow-hidden rounded-md">
                      <img
                        src={message.imageUrl?.startsWith('https://open.feishu.cn') 
                          ? `/api/image-proxy?url=${encodeURIComponent(message.imageUrl)}` 
                          : message.imageUrl}
                        alt="图像" 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          console.error('图片加载失败:', message.imageUrl);
                          e.currentTarget.src = '/placeholder-image.svg';
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {message.type === 'loading' && (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{message.content}</span>
                  </div>
                )}
                
                {message.type === 'error' && (
                  <div className="text-red-500">
                    <span>错误：{message.content}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>
      
      <CardFooter className="border-t p-4">
        <div className="flex w-full items-end gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleSelectFileClick}
            className="shrink-0"
            disabled={isLoading}
          >
            <Upload className="h-5 w-5" />
            <span className="sr-only">上传图片</span>
          </Button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          
          <div className="relative flex-grow">
            <Textarea
              placeholder="输入消息..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] resize-none pr-12"
              disabled={isLoading}
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSendMessage}
              className="absolute bottom-1 right-1"
              disabled={isLoading || (!input.trim() && !selectedFile)}
            >
              <Send className="h-5 w-5" />
              <span className="sr-only">发送</span>
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
