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
        
        // 增强类型检查和调试信息
        console.log('开始处理图片组，共 ' + data.data.imageGroups.length + ' 个原始分组');

        // 第一步：首先处理所有上传类型的原始图片
        console.log('第一步：优先处理所有上传类型的原始图片');
        
        // 创建一个列表来跟踪上传类型的原始图片
        const uploadedOriginalImages: Record<string, ImageItem> = {};
        const processedIds = new Set<string>(); // 跟踪已处理的ID
        
        // 处理所有上传类型的原始图片
        data.data.imageGroups.forEach((group: ImageGroup, index: number) => {
          if (!group.original || !group.original.id) return;
          
          // 只处理上传类型的原始图片
          if (group.original.type === 'uploaded') {
            const uploadedId = group.original.id;
            uploadedOriginalImages[uploadedId] = group.original;
            processedIds.add(uploadedId);
            
            console.log(`优先处理上传图片: ID=${uploadedId}`);
            
            // 创建上传图片组
            groupsById[uploadedId] = {
              original: group.original,
              edits: [],
              editHistory: []
            };
            
            // 建立ID映射
            rootParentIdToGroupId[uploadedId] = uploadedId; // 上传图片ID映射到自己的组
            
            // 如果有rootParentId，也添加映射
            if (group.original.rootParentId) {
              rootParentIdToGroupId[group.original.rootParentId] = uploadedId;
            }
          }
        });
        
        // 第二步：处理其他非上传类型的原始图片
        console.log('第二步：处理非上传类型的原始图片');
        
        data.data.imageGroups.forEach((group: ImageGroup, index: number) => {
          if (!group.original || !group.original.id) {
            console.warn(`警告: 组 #${index} 没有原始图片，跳过`);
            return;
          }
          
          const groupId = group.original.id;
          
          // 跳过已处理的上传图片
          if (processedIds.has(groupId)) {
            return;
          }
          
          const rootId = group.original.rootParentId || groupId;
          
          // 打印原始图片的类型和信息，帮助调试
          console.log(`处理非上传图片组 ${index}, ID=${groupId}, 类型=${group.original.type || '未知类型'}, rootParentId=${rootId}`);
          
          // 检查这个图片的rootParentId是否指向一个上传图片
          if (rootId && uploadedOriginalImages[rootId]) {
            console.log(`发现非上传图片 ${groupId} 的rootParentId指向上传图片 ${rootId}`);
            
            // 将这个图片添加到上传图片的组中
            if (!groupsById[rootId].edits.some(e => e.id === group.original.id)) {
              groupsById[rootId].edits.push(group.original);
            }
            
            // 将这个图片的编辑图片也添加到上传图片组
            (group.edits || []).forEach(edit => {
              if (!groupsById[rootId].edits.some(e => e.id === edit.id)) {
                groupsById[rootId].edits.push(edit);
              }
            });
            
            // 将这个图片的编辑历史也添加到上传图片组
            (group.editHistory || []).forEach(history => {
              if (!groupsById[rootId].editHistory.some(h => h.id === history.id)) {
                groupsById[rootId].editHistory.push(history);
              }
            });
            
            // 建立ID映射
            rootParentIdToGroupId[groupId] = rootId;
            processedIds.add(groupId);
            
            // 跳过创建这个组
            return;
          }
          
          // 如果不属于上传图片组，则创建自己的组
          groupsById[groupId] = {
            original: group.original,
            edits: [...(group.edits || [])],
            editHistory: [...(group.editHistory || [])]
          };
          
          // 建立ID映射
          rootParentIdToGroupId[groupId] = groupId; // 图片ID映射到自己的组
          processedIds.add(groupId);
          
          // 如果有rootParentId，也添加映射
          if (rootId !== groupId) {
            rootParentIdToGroupId[rootId] = groupId;
          }
        });
        
        console.log('第三步：处理所有编辑图片的映射关系');
        // 遍历所有组，并完成编辑图片的映射
        data.data.imageGroups.forEach((group: ImageGroup, index: number) => {
          if (!group.original || !group.original.id) return;
          
          const groupId = group.original.id;
          
          // 处理所有编辑图片
          const edits = Array.isArray(group.edits) ? group.edits : [];
          edits.forEach(edit => {
            // 跳过已处理的图片
            if (processedIds.has(edit.id)) {
              return;
            }
            
            // 检查这个编辑图片的各种关联ID，优先级：rootParentId > parentId > 所属组ID
            // 这样可以确保编辑链不会断开
            const editRootId = edit.rootParentId || edit.parentId || groupId;
            
            // 检查是否有上传图片关联
            let targetGroupId = null;
            
            // 1. 首先检查rootParentId是否指向上传图片
            if (edit.rootParentId && uploadedOriginalImages[edit.rootParentId]) {
              targetGroupId = edit.rootParentId;
              console.log(`编辑图片(ID=${edit.id})的rootParentId(${edit.rootParentId})指向上传图片`);
            }
            // 2. 然后检查parentId是否指向上传图片
            else if (edit.parentId && uploadedOriginalImages[edit.parentId]) {
              targetGroupId = edit.parentId;
              console.log(`编辑图片(ID=${edit.id})的parentId(${edit.parentId})指向上传图片`);
            }
            // 3. 检查editRootId是否指向上传图片
            else if (uploadedOriginalImages[editRootId]) {
              targetGroupId = editRootId;
              console.log(`编辑图片(ID=${edit.id})的关联ID(${editRootId})指向上传图片`);
            }
            
            if (targetGroupId) {
              // 将这个编辑图片添加到目标上传图片的组中
              if (!groupsById[targetGroupId].edits.some(e => e.id === edit.id)) {
                groupsById[targetGroupId].edits.push(edit);
                console.log(`将编辑图片(ID=${edit.id})添加到上传图片组(ID=${targetGroupId})`);
              }
              
              // 建立ID映射
              rootParentIdToGroupId[edit.id] = targetGroupId;
              processedIds.add(edit.id);
            } else {
              // 如果不属于上传图片组，则映射到原始组
              rootParentIdToGroupId[edit.id] = groupId;
              console.log(`编辑图片(ID=${edit.id})不关联上传图片，保留在原组(ID=${groupId})`);
            }
          });
        });
        
        console.log('第四步：最终处理和清理组关系');
        
        // 最终检查：确保所有编辑图片都在正确的组中
        console.log('最终检查：确保所有编辑图片都在正确的组中');
        
        // 特别处理上传图片的相关编辑图片
        Object.keys(uploadedOriginalImages).forEach(uploadedId => {
          // 确保所有上传图片的组ID就是图片自身的ID
          rootParentIdToGroupId[uploadedId] = uploadedId;
          console.log(`确保上传图片ID=${uploadedId}映射到自己的组`);
          
          // 确保上传图片组存在，如果不存在则创建
          if (!groupsById[uploadedId]) {
            console.log(`创建缺失的上传图片组: ID=${uploadedId}`);
            groupsById[uploadedId] = {
              original: uploadedOriginalImages[uploadedId],
              edits: [],
              editHistory: []
            };
          }
          
          // 遍历所有组，找到与这个上传图片相关的编辑图片
          Object.entries(groupsById).forEach(([otherGroupId, otherGroup]) => {
            // 跳过自身组和空组
            if (otherGroupId === uploadedId || !otherGroup || !otherGroup.original) return;
            
            // 增强关联检查逻辑，检查原始图片的各种可能关联
            const isRelated = (
              otherGroup.original.parentId === uploadedId || 
              otherGroup.original.rootParentId === uploadedId ||
              // 增加额外的检查，如果原始图片的ID包含上传图片ID的一部分
              (otherGroup.original.id && otherGroup.original.id.includes(uploadedId.substring(0, 8)))
            );
            
            if (isRelated) {
              console.log(`发现原始图片ID=${otherGroup.original.id}与上传图片ID=${uploadedId}相关`);
              
              // 将这个原始图片添加到上传图片组的编辑图片中
              if (!groupsById[uploadedId].edits.some(e => e.id === otherGroup.original.id)) {
                groupsById[uploadedId].edits.push(otherGroup.original);
              }
              
              // 将这个组的所有编辑图片也添加到上传图片组
              (otherGroup.edits || []).forEach(edit => {
                if (!groupsById[uploadedId].edits.some(e => e.id === edit.id)) {
                  groupsById[uploadedId].edits.push(edit);
                }
                rootParentIdToGroupId[edit.id] = uploadedId;
              });
              
              // 将这个组的编辑历史也添加到上传图片组
              (otherGroup.editHistory || []).forEach(history => {
                if (!groupsById[uploadedId].editHistory.some(h => h.id === history.id)) {
                  groupsById[uploadedId].editHistory.push(history);
                }
              });
              
              // 标记这个组已处理，后面会删除
              delete groupsById[otherGroupId];
            }
            
            // 检查组中的所有编辑图片
            const editsToMove = [];
            (otherGroup.edits || []).forEach(edit => {
              if ((edit.parentId === uploadedId || edit.rootParentId === uploadedId) && 
                  !groupsById[uploadedId].edits.some(e => e.id === edit.id)) {
                console.log(`发现编辑图片ID=${edit.id}与上传图片ID=${uploadedId}相关`);
                editsToMove.push(edit);
                rootParentIdToGroupId[edit.id] = uploadedId;
              }
            });
            
            // 将相关的编辑图片移动到上传图片组
            if (editsToMove.length > 0) {
              console.log(`将${editsToMove.length}个编辑图片从组${otherGroupId}移动到上传图片组${uploadedId}`);
              editsToMove.forEach(edit => {
                groupsById[uploadedId].edits.push(edit);
              });
              
              // 从原组中移除这些编辑图片
              otherGroup.edits = otherGroup.edits.filter(edit => 
                !editsToMove.some(e => e.id === edit.id)
              );
            }
          });
        });
        
        // 最后清理空组
        const groupIdsToDelete = [];
        Object.entries(groupsById).forEach(([groupId, group]) => {
          if (!group || !group.original) {
            groupIdsToDelete.push(groupId);
          }
        });
        
        groupIdsToDelete.forEach(groupId => {
          console.log(`删除空组: ID=${groupId}`);
          delete groupsById[groupId];
        });
        
        // 收集所有rootParentId对应的组
        const groupsByRootParentId: Record<string, string[]> = {};
        
        Object.keys(rootParentIdToGroupId).forEach(id => {
          if (id.includes('-')) { // 只处理UUID形式的ID，这大多是rootParentId
            const targetGroupId = rootParentIdToGroupId[id];
            
            if (!groupsByRootParentId[id]) {
              groupsByRootParentId[id] = [];
            }
            
            if (!groupsByRootParentId[id].includes(targetGroupId)) {
              groupsByRootParentId[id].push(targetGroupId);
            }
          }
        });
        
        // 处理合并需求
        Object.keys(groupsByRootParentId).forEach(rootId => {
          const groupsForRootId = groupsByRootParentId[rootId];
          
          if (groupsForRootId.length > 1) {
            console.log(`发现rootParentId=${rootId}对应多个组: ${groupsForRootId.join(', ')}，需要合并`);    
            
            // 选择一个目标组
            let targetGroupId = groupsForRootId[0]; // 默认选择第一个
            
            // 优先选择上传类型的组作为目标
            for (const gid of groupsForRootId) {
              if (groupsById[gid]?.original?.type === 'uploaded') {
                targetGroupId = gid;
                console.log(`优先选择上传类型的组 ${gid} 作为目标组`);
                break;
              }
            }
            
            // 如果没有上传类型，则尝试找一个非编辑类型的组作为目标
            if (groupsById[targetGroupId]?.original?.type === 'edited') {
              for (const gid of groupsForRootId) {
                if (groupsById[gid]?.original?.type !== 'edited') {
                  targetGroupId = gid;
                  console.log(`选择非编辑类型的组 ${gid} 作为目标组`);
                  break;
                }
              }
            }
            
            console.log(`选择组${targetGroupId}作为合并目标组`);
            
            // 合并其他组到目标组
            groupsForRootId.forEach(gid => {
              if (gid !== targetGroupId && groupsById[gid]) {
                // 将原始图片添加为目标组的编辑图片
                if (!groupsById[targetGroupId].edits.some(e => e.id === groupsById[gid].original.id)) {
                  console.log(`将组${gid}的原始图片添加为组${targetGroupId}的编辑图片`);
                  groupsById[targetGroupId].edits.push(groupsById[gid].original);
                }
                
                // 将编辑图片添加到目标组
                groupsById[gid].edits.forEach(edit => {
                  if (!groupsById[targetGroupId].edits.some(e => e.id === edit.id)) {
                    groupsById[targetGroupId].edits.push(edit);
                  }
                });
                
                // 将编辑历史添加到目标组
                groupsById[gid].editHistory.forEach(history => {
                  if (!groupsById[targetGroupId].editHistory.some(h => h.id === history.id)) {
                    groupsById[targetGroupId].editHistory.push(history);
                  }
                });
                
                // 删除被合并的组
                delete groupsById[gid];
                
                // 更新所有相关的映射
                Object.keys(rootParentIdToGroupId).forEach(key => {
                  if (rootParentIdToGroupId[key] === gid) {
                    rootParentIdToGroupId[key] = targetGroupId;
                  }
                });
              }
            });
          }
        });
        
        // 确保原始图片(类型为'uploaded')出现在组中
        console.log('第四步：确保所有上传的原始图片都有对应组');
        
        // 创建一个列表来跟踪已经处理过的上传图片
        const processedUploadedImages = new Set<string>();
        
        data.data.imageGroups.forEach(group => {
          if (!group.original || !group.original.id) return;
          
          // 特别检查上传类型的图片
          if (group.original.type === 'uploaded') {
            const uploadedId = group.original.id;
            processedUploadedImages.add(uploadedId);
            
            // 检查这个上传图片是否已经存在于组中
            if (!groupsById[uploadedId]) {
              // 没有找到这个上传图片的组，创建新组
              console.log(`创建上传图片组: ID=${uploadedId}`);
              
              groupsById[uploadedId] = {
                original: group.original,
                edits: [],
                editHistory: []
              };
              
              // 将原始组中的编辑图片移到新组
              if (group.edits && group.edits.length > 0) {
                groupsById[uploadedId].edits = [...group.edits];
              }
              
              // 将原始组中的编辑历史移到新组
              if (group.editHistory && group.editHistory.length > 0) {
                groupsById[uploadedId].editHistory = [...group.editHistory];
              }
            } else {
              // 已经存在这个上传图片的组，确保它是原始图片
              console.log(`确保上传图片 ${uploadedId} 是其组的原始图片`);
              
              // 如果这个上传图片在编辑图片列表中，将其移动到原始图片位置
              const editIndex = groupsById[uploadedId].edits.findIndex(e => e.id === uploadedId);
              if (editIndex >= 0) {
                console.log(`将上传图片从编辑列表移动到原始图片位置`);
                const uploadedImage = groupsById[uploadedId].edits.splice(editIndex, 1)[0];
                
                // 如果组的原始图片不是上传图片，将其移动到编辑列表
                if (groupsById[uploadedId].original.id !== uploadedId) {
                  groupsById[uploadedId].edits.push(groupsById[uploadedId].original);
                  groupsById[uploadedId].original = uploadedImage;
                }
              }
              
              // 将原始组中的编辑图片添加到这个组
              if (group.edits && group.edits.length > 0) {
                group.edits.forEach(edit => {
                  if (!groupsById[uploadedId].edits.some(e => e.id === edit.id)) {
                    groupsById[uploadedId].edits.push(edit);
                  }
                });
              }
            }
            
            // 设置映射
            rootParentIdToGroupId[uploadedId] = uploadedId;
            if (group.original.rootParentId) {
              rootParentIdToGroupId[group.original.rootParentId] = uploadedId;
            }
          }
        });
        
        // 检查是否有上传图片被错误地放在了编辑图片列表中
        Object.values(groupsById).forEach(group => {
          const uploadedEdits = group.edits.filter(edit => 
            edit.type === 'uploaded' && !processedUploadedImages.has(edit.id)
          );
          
          // 如果发现上传图片在编辑列表中，将其移动到自己的组
          uploadedEdits.forEach(uploadedEdit => {
            console.log(`发现上传图片 ${uploadedEdit.id} 在组 ${group.original.id} 的编辑列表中`);
            processedUploadedImages.add(uploadedEdit.id);
            
            // 创建一个新组以这个上传图片作为原始图片
            if (!groupsById[uploadedEdit.id]) {
              console.log(`创建上传图片组: ID=${uploadedEdit.id}`);
              groupsById[uploadedEdit.id] = {
                original: uploadedEdit,
                edits: [],
                editHistory: []
              };
              
              // 设置映射
              rootParentIdToGroupId[uploadedEdit.id] = uploadedEdit.id;
              
              // 从原组中移除这个上传图片
              group.edits = group.edits.filter(edit => edit.id !== uploadedEdit.id);
            }
          });
        });
        
        // 为所有图片检查rootParentId并尝试根据映射合并组
        console.log('第二步: 根据rootParentId检查并合并组...');
        
        // 创建一个映射关系数组，用于检测需要合并的组
        const rootIdsMappings: {rootId: string, groupId: string}[] = [];
        
        Object.keys(rootParentIdToGroupId).forEach(id => {
          if (id.includes('-')) { // 只处理可能是rootParentId的值（假设包含短横线的是UUID格式）
            rootIdsMappings.push({
              rootId: id,
              groupId: rootParentIdToGroupId[id]
            });
          }
        });
        
        console.log(`找到 ${rootIdsMappings.length} 个rootParentId映射关系`);
        
        // 检查是否有相同rootId对应不同组的情况
        const rootIdsMap: Record<string, Set<string>> = {};
        
        rootIdsMappings.forEach(mapping => {
          if (!rootIdsMap[mapping.rootId]) {
            rootIdsMap[mapping.rootId] = new Set<string>();
          }
          rootIdsMap[mapping.rootId].add(mapping.groupId);
        });
        
        // 处理需要合并的组
        for (const rootId in rootIdsMap) {
          const groupIds = Array.from(rootIdsMap[rootId]);
          
          if (groupIds.length > 1) {
            console.log(`rootParentId=${rootId} 对应多个组: ${groupIds.join(', ')}，需要合并`);
            
            // 选择第一个组作为目标组
            const targetGroupId = groupIds[0];
            const groupsToMerge = groupIds.slice(1);
            
            // 合并其他组到目标组
            groupsToMerge.forEach(sourceGroupId => {
              if (groupsById[sourceGroupId]) {
                const sourceGroup = groupsById[sourceGroupId];
                
                // 如果源组有原始图片，将其添加为目标组的编辑图片
                if (sourceGroup.original && !groupsById[targetGroupId].edits.some(e => e.id === sourceGroup.original.id)) {
                  groupsById[targetGroupId].edits.push(sourceGroup.original);
                }
                
                // 将源组的编辑图片添加到目标组
                sourceGroup.edits.forEach(edit => {
                  if (!groupsById[targetGroupId].edits.some(e => e.id === edit.id)) {
                    groupsById[targetGroupId].edits.push(edit);
                  }
                });
                
                // 将源组的编辑历史记录添加到目标组
                sourceGroup.editHistory.forEach(history => {
                  if (!groupsById[targetGroupId].editHistory.some(h => h.id === history.id)) {
                    groupsById[targetGroupId].editHistory.push(history);
                  }
                });
                
                // 删除源组
                delete groupsById[sourceGroupId];
                
                // 更新所有相关映射
                for (const key in rootParentIdToGroupId) {
                  if (rootParentIdToGroupId[key] === sourceGroupId) {
                    rootParentIdToGroupId[key] = targetGroupId;
                  }
                }
              }
            });
          }
        }

        // 第三步：确保所有编辑历史记录都被添加到正确的组
        console.log('第三步: 最终处理编辑历史记录...');
        
        data.data.imageGroups.forEach(group => {
          const histories = Array.isArray(group.editHistory) ? group.editHistory : [];
          
          histories.forEach(history => {
            // 按优先级查找该历史记录应归属的组
            let targetGroupId = null;
            
            // 优先检查rootParentId
            if (history.rootParentId && rootParentIdToGroupId[history.rootParentId]) {
              targetGroupId = rootParentIdToGroupId[history.rootParentId];
            }
            // 如果没有rootParentId或映射不存在，则检查imageId
            else if (history.imageId && rootParentIdToGroupId[history.imageId]) {
              targetGroupId = rootParentIdToGroupId[history.imageId];
            }
            // 最后检查resultImageId
            else if (history.resultImageId && rootParentIdToGroupId[history.resultImageId]) {
              targetGroupId = rootParentIdToGroupId[history.resultImageId];
            }
            
            // 如果找到目标组且该组存在，则添加历史记录
            if (targetGroupId && groupsById[targetGroupId]) {
              // 确保不重复添加
              if (!groupsById[targetGroupId].editHistory.some(h => h.id === history.id)) {
                groupsById[targetGroupId].editHistory.push(history);
                console.log(`将编辑历史 ${history.id} 添加到组 ${targetGroupId}`);
              }
            } else {
              console.log(`无法确定编辑历史 ${history.id} 的目标组，保留在原组`);
            }
          });
        });
        
        console.log('已完成所有图片组的处理和映射');
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
