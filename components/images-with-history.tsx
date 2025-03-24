"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Clock, Image as ImageIcon, Edit } from "lucide-react";

interface ImageItem {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  type?: string;
  rootParentId?: string;
  parentId?: string;
  isVercelEnv?: boolean; // 添加isVercelEnv字段
}

interface EditHistory {
  id: string;
  imageId: string;
  prompt: string;
  resultImageId: string;
  rootParentId?: string; // 添加根父ID字段
  createdAt: string;
}

interface ImageGroup {
  original: ImageItem;
  edits: ImageItem[];
  editHistory: EditHistory[];
}

// 统计信息接口已移除

export function ImagesWithHistory() {
  console.log('ImagesWithHistory 组件渲染 -', new Date().toISOString());
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVercelEnv, setIsVercelEnv] = useState(false);

  // 获取图片历史记录
  const fetchImagesWithHistory = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 使用更严格的缓存破坏机制
      const randomId = Math.random().toString(36).substring(2, 15);
      const timestamp = Date.now();

      console.log(`开始获取图片历史 - 随机参数: ${randomId}, 时间戟: ${timestamp}`);

      const response = await fetch(`/api/images-with-history?_t=${timestamp}&_r=${randomId}`, {
        // 使用原生 fetch 选项强制设置禁用缓存
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Random': randomId
        },
        cache: 'no-store',
        // 添加其他与缓存相关的选项
        credentials: 'same-origin',
        redirect: 'follow'
      });
      const data = await response.json();

      if (!response.ok) {
        console.error(`API响应错误: ${response.status} ${response.statusText}`);
        throw new Error(data.error?.message || "获取图片历史记录失败");
      }
      
      if (data.success && data.data?.imageGroups) {
        // 开始处理图片组数据
        
        // 首先创建两个重要的映射
        // 1. 直接使用已分组的数据，不再重新构建组
        const groupsById: Record<string, ImageGroup> = {};
        
        // 2. rootParentId到组ID的映射
        const rootParentIdToGroupId: Record<string, string> = {};
        
        // 第一步：首先创建 rootParentId 映射表
        // 首先遍历所有图片，分析并收集所有的 rootParentId
        console.log('第一步: 创建 rootParentId 映射表...');
        
        // 创建结构： rootParentId -> 所有相关图片的数组
        const imagesByRootParentId: Record<string, ImageItem[]> = {};
        
        // 首先收集所有图片及其 rootParentId
        data.data.imageGroups.forEach((group: ImageGroup) => {
          if (!group.original || !group.original.id) return;
          
          // 处理原始图片
          const rootId = group.original.rootParentId || group.original.id;
          if (!imagesByRootParentId[rootId]) {
            imagesByRootParentId[rootId] = [];
          }
          imagesByRootParentId[rootId].push(group.original);
          
          // 处理编辑图片
          const edits = Array.isArray(group.edits) ? group.edits : [];
          edits.forEach(edit => {
            const editRootId = edit.rootParentId || edit.id;
            if (!imagesByRootParentId[editRootId]) {
              imagesByRootParentId[editRootId] = [];
            }
            imagesByRootParentId[editRootId].push(edit);
          });
        });
        
        console.log(`找到 ${Object.keys(imagesByRootParentId).length} 个不同的 rootParentId`);
        
        // 第二步：为每个 rootParentId 创建一个组
        console.log('第二步: 为每个 rootParentId 创建组...');
        
        Object.keys(imagesByRootParentId).forEach(rootId => {
          const images = imagesByRootParentId[rootId];
          if (!images || images.length === 0) return;
          
          console.log(`处理 rootParentId=${rootId} 的图片组，发现 ${images.length} 张图片`);
          
          // 排序图片，选择最早的作为原始图片
          // 注意：我们优先选择类型为上传或生成的图片，而非编辑的图片
          const sortedImages = [...images].sort((a, b) => {
            // 优先选择原始上传或生成的图片
            const aIsEdit = a.type === 'edited';
            const bIsEdit = b.type === 'edited';
            if (aIsEdit !== bIsEdit) {
              return aIsEdit ? 1 : -1; // 非编辑图片优先
            }
            // 如果类型相同，按时间戳排序
            const aTime = parseInt(a.createdAt) || 0;
            const bTime = parseInt(b.createdAt) || 0;
            return aTime - bTime;
          });
          
          const originalImage = sortedImages[0]; // 选取最早的图片作为原始图片
          const editImages = sortedImages.slice(1); // 其余图片作为编辑图片
          
          console.log(`为 rootParentId=${rootId} 创建新组，使用图片 ${originalImage.id} 作为原始图片`);
          
          // 创建新组
          groupsById[originalImage.id] = {
            original: originalImage,
            edits: editImages,
            editHistory: []
          };
          
          // 建立映射关系
          rootParentIdToGroupId[rootId] = originalImage.id;
          
          // 将图片ID映射到组
          [originalImage, ...editImages].forEach(img => {
            rootParentIdToGroupId[img.id] = originalImage.id;
          });
        });

        // 第三步：重新收集所有编辑历史记录
        console.log('第三步: 收集编辑历史记录...');
        
        data.data.imageGroups.forEach(group => {
          const histories = Array.isArray(group.editHistory) ? group.editHistory : [];
          
          histories.forEach(history => {
            // 确定属于哪个组
            let targetGroupId = null;
            
            // 按优先级查找目标组
            if (history.rootParentId && rootParentIdToGroupId[history.rootParentId]) {
              targetGroupId = rootParentIdToGroupId[history.rootParentId];
            } else if (history.imageId && rootParentIdToGroupId[history.imageId]) {
              targetGroupId = rootParentIdToGroupId[history.imageId];
            } else if (history.resultImageId && rootParentIdToGroupId[history.resultImageId]) {
              targetGroupId = rootParentIdToGroupId[history.resultImageId];
            }
            
            if (targetGroupId && groupsById[targetGroupId]) {
              if (!groupsById[targetGroupId].editHistory.some(h => h.id === history.id)) {
                groupsById[targetGroupId].editHistory.push(history);
                console.log(`将编辑历史 ${history.id} 添加到组 ${targetGroupId}`);
              }
            }
          });
        });
        
        console.log('第一阶段: 已完成原始图片组的构建和映射初始化');
        console.log('当前映射表中有 ' + Object.keys(rootParentIdToGroupId).length + ' 个ID映射');
        

        

        
        // 转换为数组并过滤掉无效的组
        const validatedGroups: ImageGroup[] = Object.values(groupsById)
          .filter((group): group is ImageGroup => !!group.original && !!group.original.id);
        
        // 组处理完成
        
        setImageGroups(validatedGroups);
        
        // 从第一个图片组中获取isVercelEnv标志
        if (validatedGroups.length > 0 && validatedGroups[0].original && validatedGroups[0].original.isVercelEnv !== undefined) {
          setIsVercelEnv(validatedGroups[0].original.isVercelEnv);
          console.log('从API获取Vercel环境标志:', validatedGroups[0].original.isVercelEnv);
        }
      } else {
        console.error("API响应格式不符合预期:", data);
        setError("API响应格式不符合预期");
      }
    } catch (err) {
      console.error("获取图片历史记录失败:", err);
      setError(err instanceof Error ? err.message : "发生错误");
    } finally {
      setIsLoading(false);
    }
  };

  // 添加刷新按钮的处理函数
  const handleRefresh = () => {
    console.log('手动刷新图片历史');
    fetchImagesWithHistory();
  };

  useEffect(() => {
    fetchImagesWithHistory();
  }, []);
  
  const getImageSrc = (url: string, isVercelEnv: boolean) => {
    // 检查是否是飞书URL
    const isFeishuUrl = url.includes('open.feishu.cn');
    
    // 检查是否是本地URL
    const isLocalUrl = url.startsWith('/') && !url.startsWith('/api/');
    
    // 在Vercel环境中，本地URL无法工作
    if (isVercelEnv && isLocalUrl) {
      console.error('在Vercel环境中检测到本地URL，这无法正常工作:', url);
      // 尝试从URL中提取图片ID
      const matches = url.match(/\/images\/([a-zA-Z0-9-]+)\.(png|jpg|jpeg|webp)/i);
      if (matches && matches[1]) {
        const imageId = matches[1];
        console.log('从本地URL提取到图片ID:', imageId);
        // 使用图片元数据API获取飞书URL
        return `/api/image-metadata?id=${imageId}`;
      }
      return '/placeholder-image.svg';
    }
    
    // 如果是飞书URL，始终使用代理
    if (isFeishuUrl) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    
    // 其他情况直接返回URL
    return url;
  };

  if (isLoading) {
    return <div className="text-center py-8">正在加载图片历史记录...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">加载图片历史记录出错: {error}</div>;
  }

  if (imageGroups.length === 0) {
    return <div className="text-center py-8">还没有图片编辑历史记录</div>;
  }

  return (
    <div className="w-full space-y-4 mt-8 pt-8">
      <div className="flex justify-center items-center mb-8">
        <h2 className="text-6xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-transparent bg-clip-text inline-block">图片广场</h2>
        <Button variant="ghost" size="icon" onClick={handleRefresh} className="ml-4 rounded-full hover:bg-gray-100">
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-blue-500' : 'text-gray-500 hover:text-gray-700'}`} />
        </Button>
      </div>
      
      {/* 数据统计部分已移除 */}
      
      <div className="columns-1 md:columns-2 gap-8 space-y-8">
        {/* 使用CSS columns实现真正的瀑布流布局 */}
        {imageGroups.map((group) => {
          // 将所有编辑记录和图片连接起来，构建对话流程
          const chatItems = [];
          
          // 先添加原始指令和生成图片的对话
          chatItems.push({
            type: "user",
            content: group.original.prompt,
            createdAt: group.original.createdAt
          });
          
          chatItems.push({
            type: "ai",
            content: group.original.url,
            isImage: true,
            createdAt: group.original.createdAt
          });
          
          // 创建一个更完整的图片编辑链式历史
          // 这将按更精确的顺序展示全部编辑历史
          let editPairs = [];
          // 记录已经处理过的图片ID，避免重复处理
          const processedImageIds = new Set([group.original.id]);
          
          // 图片组调试信息已移除
          
          // 创建一个简化版的图片查询字典
          const imageById = {};
          
          // 将原始图片加入字典
          imageById[group.original.id] = {
            ...group.original,
            isOriginal: true,
            type: group.original.type || '原始图片'
          };

          
          // 将所有编辑图片加入字典
          group.edits.forEach(edit => {
            // 确保我们不重复添加已经存在的图片
            if (!imageById[edit.id]) {
              imageById[edit.id] = {
                ...edit,
                isOriginal: false,
                type: edit.type || '编辑图片'
              };

            } else {

            }
          });
          
          // 使用编辑历史直接构建编辑对话流
          
          // 将编辑历史按时间排序
          const sortedHistory = [...group.editHistory].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // 处理每个编辑历史记录
          sortedHistory.forEach((history, index) => {
            // 只处理有效的编辑历史
            if (history.resultImageId && imageById[history.resultImageId]) {
              // 确保这个图片还没被处理过
              if (!processedImageIds.has(history.resultImageId)) {
                const resultImage = imageById[history.resultImageId];
                
                // 检查是否有相关联的图片
                let parentImage = null;
                if (history.imageId && imageById[history.imageId]) {
                  parentImage = imageById[history.imageId];
                  console.log(`编辑历史中找到父图片: ID=${history.imageId}, URL=${parentImage.url}`);
                } else {
                  console.log(`编辑历史中没有找到父图片: imageId=${history.imageId}`);
                }
                
                // 标记为已处理
                processedImageIds.add(history.resultImageId);
                
                // 添加详细的日志，便于调试
                console.log(`将编辑历史添加到编辑对中:`);
                console.log(`  结果图片ID: ${history.resultImageId}`);
                console.log(`  父图片ID: ${history.imageId}`);
                console.log(`  根父级ID: ${history.rootParentId || resultImage.rootParentId || '无'}`);
                
                // 确保我们使用正确的rootParentId
                let effectiveRootParentId = history.rootParentId;
                if (!effectiveRootParentId && resultImage.rootParentId) {
                  effectiveRootParentId = resultImage.rootParentId;
                  console.log(`  使用结果图片中的rootParentId: ${effectiveRootParentId}`);
                } else if (effectiveRootParentId) {
                  console.log(`  使用编辑历史中的rootParentId: ${effectiveRootParentId}`);
                } else if (parentImage && parentImage.rootParentId) {
                  effectiveRootParentId = parentImage.rootParentId;
                  console.log(`  使用父图片中的rootParentId: ${effectiveRootParentId}`);
                } else {
                  // 如果所有地方都没有rootParentId，则使用父图片ID作为rootParentId
                  effectiveRootParentId = history.imageId;
                  console.log(`  没有找到rootParentId，使用父图片ID作为rootParentId: ${effectiveRootParentId}`);
                }
                
                editPairs.push({
                  prompt: history.prompt || "未提供编辑提示词",
                  image: resultImage,
                  parentImage: parentImage,
                  resultImageId: history.resultImageId,
                  parentImageId: history.imageId,
                  rootParentId: effectiveRootParentId,
                  createdAt: history.createdAt,
                  type: "history",
                  metadata: {
                    imageType: resultImage.type || '未知',
                    parentType: parentImage ? parentImage.type || '未知' : '无父图片',
                    rootParentId: effectiveRootParentId
                  }
                });
                

              } else {
  
              }
            }
          });
          
          console.log(`处理了 ${editPairs.length} 条编辑历史`);
          
          // 检查是否有编辑图片没有对应的历史记录
          group.edits.forEach((edit) => {
            if (!processedImageIds.has(edit.id)) {
              console.log(`找到没有编辑历史的图片: ID=${edit.id}, 添加到列表中`);
              
              // 添加到已处理列表
              processedImageIds.add(edit.id);
              
              // 添加详细的日志，便于调试
              console.log(`添加孤立图片到编辑对:`);
              console.log(`  图片ID: ${edit.id}`);
              console.log(`  父图片ID: ${edit.parentId || '无'}`);
              console.log(`  根父级ID: ${edit.rootParentId || '无'}`);
              
              // 添加到编辑对列表
              editPairs.push({
                prompt: edit.prompt || "未知编辑指令",
                image: imageById[edit.id],
                resultImageId: edit.id,
                parentImageId: edit.parentId, // 添加父图片ID
                rootParentId: edit.rootParentId, // 添加根父级ID
                createdAt: edit.createdAt,
                type: "orphan_image",
                metadata: {
                  imageType: edit.type || '未知',
                  parentType: edit.parentId ? '有父图片' : '无父图片',
                  rootParentId: edit.rootParentId || '无'
                }
              });
            }
          });
          
          // 按时间排序所有的编辑对话
          editPairs.sort((a, b) => {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });
          
          console.log(`最终处理了 ${editPairs.length} 对编辑对话`);
          

          
          // 去除重复的编辑对话项
          const uniquePairs = [];
          const seenPairs = new Set();
          
          editPairs.forEach(pair => {
            // 创建唯一键：源图片ID + 结果图片ID
            const pairKey = `${pair.parentImageId || ''}:${pair.resultImageId || ''}`;
            
            // 如果这对编辑尚未处理过，添加到结果中
            if (pairKey !== ':' && !seenPairs.has(pairKey)) {
              seenPairs.add(pairKey);
              uniquePairs.push(pair);
            } else {
              console.log(`  过滤掉重复的编辑对: ${pairKey}`);
            }
          });
          
          // 用过滤后的唯一编辑对替换原始数组
          editPairs = uniquePairs;
          console.log(`去重后有 ${editPairs.length} 个唯一编辑对话项`);
          
          console.log(`最终排序后有 ${editPairs.length} 个编辑对话项目`);
          
          // 将返回的全部原始信息打印出来进行调试
          console.log(`原始图片 ID=${group.original.id}, 提示词=${group.original.prompt}`);
          console.log(`编辑历史记录:`, JSON.stringify(group.editHistory));
          console.log(`编辑后图片:`, JSON.stringify(group.edits));
          console.log(`生成的对话对:`, JSON.stringify(editPairs));
          
          // 显示editPairs的详细信息
          editPairs.forEach((pair, index) => {
            console.log(`对话项 #${index+1}/${editPairs.length}: ${JSON.stringify(pair)}`);
          });
          
          // 将编辑链添加到对话中
          editPairs.forEach((pair, index) => {
            console.log(`处理对话项 #${index+1}/${editPairs.length}: 类型=${pair.type || '未知'}, 提示="${pair.prompt || '未提供'}"`);
            
            // 添加路径和步骤信息输出，便于调试
            if (pair.pathIndex !== undefined && pair.stepIndex !== undefined) {
              console.log(`  编辑链路径 #${pair.pathIndex+1}, 步骤 #${pair.stepIndex+1}, 从 ${pair.parentImageId} 到 ${pair.resultImageId}`);
            }
            
            // 确保所有字段都有值，使用空字符串作为默认值
            const safePrompt = pair.prompt || "未提供提示词";
            const safeCreatedAt = pair.createdAt || new Date().toISOString();
            
            // 添加用户的编辑指令 - 注意不要使用空的提示词
            if (safePrompt.trim() !== "") {
              // 如果有父图片信息，添加到详细信息中
              const hasParentImage = pair.parentImage && pair.parentImage.id;
              let userContent = safePrompt;
              
              // 添加编辑链路径信息往对话内容
              if (pair.pathIndex !== undefined && pair.stepIndex !== undefined && hasParentImage) {
                userContent = `${safePrompt}`;
              }
              
              // 添加特殊字段调试信息
              const debugInfo = pair.metadata ? 
                ` (图片类型: ${pair.metadata.imageType}, 父图片类型: ${pair.metadata.parentType}, 根ID: ${pair.metadata.rootParentId})` : '';
              
              chatItems.push({
                type: "user",
                content: userContent,
                createdAt: safeCreatedAt,
                pairIndex: index,
                pairType: pair.type || "unknown",
                parentImageId: pair.parentImageId, // 添加父图片信息
                rootParentId: pair.rootParentId, // 添加根父图片信息
                pathIndex: pair.pathIndex,
                stepIndex: pair.stepIndex,
                debugInfo: debugInfo  // 添加调试信息
              });
              
              // 添加AI生成的结果图片 (如果存在)
              if (pair.image && pair.image.url) {
                console.log(`  有图片结果: ${pair.image.url}, ID=${pair.image.id}, 类型=${pair.image.type || '未知'}, 父ID=${pair.image.parentId || '无'}, 根父ID=${pair.image.rootParentId || '无'}`);
                chatItems.push({
                  type: "ai",
                  content: pair.image.url,
                  isImage: true,
                  createdAt: pair.image.createdAt || safeCreatedAt,
                  pairIndex: index,
                  pairType: pair.type || "unknown",
                  resultImageId: pair.resultImageId,
                  parentImageId: pair.parentImageId,
                  rootParentId: pair.image.rootParentId, // 添加根父ID
                  imageType: pair.image.type || '未知', // 添加图片类型
                  pathIndex: pair.pathIndex,
                  stepIndex: pair.stepIndex,
                  metadata: pair.metadata // 增加元数据信息
                });
              } else {
                // 如果没有对应的图片，显示一个提示消息
                console.log(`  警告: 没有找到结果图片 ID=${pair.resultImageId || '无ID'}`);
                
                let missingImageMessage = `没有找到编辑结果图片`;
                if (pair.resultImageId) {
                  missingImageMessage += ` (ID: ${pair.resultImageId})`;
                }
                
                if (pair.type === "orphan_history") {
                  missingImageMessage += `\n\n这是一条孤立的编辑历史记录，可能编辑链不完整。`;
                } else {
                  missingImageMessage += `，可能图片不存在或者已被删除。`;
                }
                
                chatItems.push({
                  type: "ai",
                  content: missingImageMessage,
                  isImage: false,
                  createdAt: safeCreatedAt,
                  pairIndex: index,
                  pairType: pair.type || "unknown",
                  resultImageId: pair.resultImageId || "no-id",
                  parentImageId: pair.parentImageId
                });
              }
            } else {

            }
          });
          
          return (
            <div key={group.original.id} className="break-inside-avoid-column mb-6 inline-block w-full">
              <Card className="overflow-hidden bg-gray-50">
              <CardContent className="pt-4">
                <div className="flex flex-col space-y-4 p-1">
                  {/* 显示对话内容 */}
                  
                  {/* 完整的对话内容 */}
                  {chatItems.map((item, index) => (
                    <div key={index} className={`flex ${item.type === "user" ? "justify-start" : "justify-end"}`}>
                      <div className={`flex max-w-[80%] ${item.type === "user" ? "flex-row" : "flex-row-reverse"}`}>
                        {/* 头像 */}
                        <div className="flex-shrink-0">
                          <img 
                            src={item.type === "user" ? "/user-avatar.svg" : "/ai-avatar.svg"} 
                            alt={item.type === "user" ? "用户" : "AI"}
                            className={`w-10 h-10 rounded-full ${item.type === "user" ? "bg-blue-100" : "bg-purple-100"}`}
                          />
                        </div>
                        
                        {/* 内容气泡 */}
                        <div 
                          className={`relative mx-2 px-4 py-3 rounded-lg ${item.type === "user" 
                            ? "bg-blue-50 text-blue-900" 
                            : "bg-purple-50 text-gray-800"
                          }`}
                        >
                          
                          {item.isImage ? (
                            // 图片内容
                            <div className="w-full max-w-[250px]">
                              <div className="relative aspect-square overflow-hidden rounded-md">
                                <img 
                                  src={getImageSrc(item.content, isVercelEnv)}
                                  alt="生成图片"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    console.error('图片加载失败:', item.content);
                                    e.currentTarget.src = '/placeholder-image.svg';
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            // 文本内容
                            <p className="whitespace-pre-wrap break-words">{item.content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 如果没有对话项，显示提示 */}
                  {chatItems.length === 0 && (
                    <div className="text-center text-gray-500 py-8">未找到任何对话记录</div>
                  )}
                </div>
              </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
