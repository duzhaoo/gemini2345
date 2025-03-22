import { NextRequest, NextResponse } from "next/server";
import { getImageRecords, getEditHistoryFromFeishu } from "@/lib/feishu";
import { ApiResponse } from "@/lib/types";

// 表示编辑历史记录的接口
interface EditHistory {
  id: string;           // 唯一标识符
  imageId: string;      // 被编辑的图片ID
  prompt: string;       // 编辑使用的提示词
  resultImageId: string;// 编辑结果图片的ID
  rootParentId?: string;// 编辑链的根节点ID
  createdAt: string;    // 创建时间
  // editGroupId字段已被移除，使用parentId构建编辑链路
}

// 图片分组接口
interface ImageGroup {
  original: any;       // 原始图片
  edits: any[];        // 编辑结果图片列表
  editHistory: EditHistory[]; // 编辑历史记录
}

// 获取所有图片及其编辑历史
export async function GET(req: NextRequest) {
  try {
    // 统计日志
    console.log('\n\n=============================================');
    console.log('开始处理获取图片及历史记录请求:', new Date().toISOString());
    
    // 不再需要初始化本地文件目录
    
    // 1. 获取所有图片记录
    const allImages = await getImageRecords();
    console.log(`获取到 ${allImages.images?.length || 0} 张图片记录`);
    
    if (!Array.isArray(allImages)) {
      console.error("从飞书获取的图片列表不是数组");
      return NextResponse.json({
        success: false,
        error: {
          code: "INVALID_DATA",
          message: "获取图片数据格式错误"
        }
      } as ApiResponse, { status: 500 });
    }
    
    // 2. 按照rootParentId优先分组图片
    const imageGroups: Record<string, ImageGroup> = {};
    
    // 映射rootParentId到组ID
    const rootParentIdToGroupId: Record<string, string> = {};
    
    // 统计数据
    let originalImageCount = 0;
    let editedImageCount = 0;
    let emptyPromptCount = 0;
    
    // 首先处理所有的原始图片（没有parentId的图片）
    for (const img of allImages) {
      // 标准化日期格式
      let createdAt = new Date().toISOString();
      try {
        if (img.timestamp) {
          if (typeof img.timestamp === 'string') {
            if (img.timestamp.includes('T')) {
              createdAt = img.timestamp;
            } else if (img.timestamp.includes('-')) {
              createdAt = new Date(img.timestamp).toISOString();
            } else if (!isNaN(Number(img.timestamp))) {
              createdAt = new Date(Number(img.timestamp)).toISOString();
            }
          } else if (typeof img.timestamp === 'number') {
            createdAt = new Date(img.timestamp).toISOString();
          }
        }
      } catch (e) {
        console.warn('无法解析时间戳:', img.timestamp);
      }
      
      // 检查提示词是否为空
      if (!img.prompt || img.prompt.trim() === '') {
        emptyPromptCount++;
        console.log(`警告: 图片 ${img.id} 的提示词为空`);
      }
      
      // 确保所有字段都有值，防止空值引起的问题
      const formattedImg = {
        id: img.id || `unknown-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url: img.url || '',
        prompt: img.prompt || '未提供提示词',
        createdAt,
        type: img.type || 'generated',
        parentId: img.parentId,
        rootParentId: img.rootParentId
      };
      
      // 预处理，收集所有可能的rootParentId
      // 首先收集所有rootParentId，不管是原始图片还是编辑图片
      if (img.rootParentId) {
        // 检查这个rootParentId是否已经有映射
        if (!rootParentIdToGroupId[img.rootParentId]) {
          // 如果这个rootParentId还没有指定组ID，就使用该rootParentId作为组ID
          rootParentIdToGroupId[img.rootParentId] = img.rootParentId;
          console.log(`建立映射: rootParentId=${img.rootParentId} -> groupId=${img.rootParentId}`);
        }
      }
      
      // 确定这张图片应该放在哪个组
      let assignedGroupId;
      
      // 优先选择处理方式：
      // 1. 如果有rootParentId，优先使用rootParentId对应的组ID
      if (img.rootParentId && rootParentIdToGroupId[img.rootParentId]) {
        // 如果有rootParentId并且已经有映射到组ID
        assignedGroupId = rootParentIdToGroupId[img.rootParentId];
        console.log(`使用rootParentId=${img.rootParentId}确定图片${img.id}应放入组${assignedGroupId}`);
      } 
      // 2. 原始图片特殊处理，使用其ID作为组ID
      else if (!img.parentId) {
        // 原始图片，直接以id作为组ID
        originalImageCount++;
        assignedGroupId = img.id;
        console.log(`原始图片 #${originalImageCount}: ${formattedImg.id}, 提示词="${formattedImg.prompt}"`);
        
        // 如果这张原始图片有rootParentId，更新映射 - 这很重要
        if (img.rootParentId) {
          rootParentIdToGroupId[img.rootParentId] = assignedGroupId;
          console.log(`原始图片 ${formattedImg.id} 有rootParentId=${img.rootParentId}，更新映射关系`);
        }
      }
      // 3. 编辑图片，使用rootParentId或parentId
      else {
        // 编辑结果图片
        editedImageCount++;
        
        if (img.rootParentId) {
          // 如果有rootParentId但前面没有处理到，创建新的映射
          assignedGroupId = img.rootParentId;
          rootParentIdToGroupId[img.rootParentId] = assignedGroupId;
          console.log(`编辑图片 #${editedImageCount}: ${formattedImg.id} 创建新的rootParentId映射: ${img.rootParentId} -> ${assignedGroupId}`);
        } else if (img.parentId) {
          // 如果没有rootParentId但有parentId
          
          // 检查这个parentId是否有对应的组或映射
          if (rootParentIdToGroupId[img.parentId]) {
            // 如果parentId有映射到组ID，使用该组ID
            assignedGroupId = rootParentIdToGroupId[img.parentId];
            console.log(`编辑图片 ${formattedImg.id} 使用parentId=${img.parentId}的映射分组到 ${assignedGroupId}`);
          } else if (imageGroups[img.parentId]) {
            // 如果parentId对应一个组，直接使用该组ID
            assignedGroupId = img.parentId;
            console.log(`编辑图片 ${formattedImg.id} 使用parentId=${img.parentId}直接分组`);
          } else {
            // 如果都没有，则使用parentId作为组ID
            assignedGroupId = img.parentId;
            console.log(`编辑图片 ${formattedImg.id} 使用parentId=${img.parentId}创建新组`);
          }
        } else {
          // 如果既没有rootParentId也没有parentId，使用图片自己的ID
          assignedGroupId = img.id;
          console.log(`编辑图片 ${formattedImg.id} 没有任何ID关联，使用自身ID创建组`);
        }
      }
      
      // 确保组存在
      if (!imageGroups[assignedGroupId]) {
        console.log(`创建新的图片组: ${assignedGroupId}`);
        imageGroups[assignedGroupId] = {
          original: null,
          edits: [],
          editHistory: []
        };
      }
      
      // 根据图片类型分配
      if (!img.parentId) {
        // 原始图片
        imageGroups[assignedGroupId].original = formattedImg;
      } else {
        // 编辑图片
        imageGroups[assignedGroupId].edits.push(formattedImg);
      }
      
      // 特别输出关键信息便于调试
      console.log(`  图片详情: ID=${formattedImg.id}, 父ID=${formattedImg.parentId || '无'}, 根父ID=${formattedImg.rootParentId || '无'}, 分组ID=${assignedGroupId}, 提示词="${formattedImg.prompt || '无'}"`);
      
      // 建立图片ID和组ID的映射关系，特别重要
      rootParentIdToGroupId[img.id] = assignedGroupId;
      console.log(`  映射更新: 图片ID=${img.id} 映射到组ID=${assignedGroupId}`);
      
      // 如果有parentId，也将其关联到当前组
      if (img.parentId) {
        rootParentIdToGroupId[img.parentId] = assignedGroupId;
        console.log(`  映射更新: 父ID=${img.parentId} 映射到组ID=${assignedGroupId}`);
      }
      
      // 如果有rootParentId，确保它也映射到当前组
      if (img.rootParentId) {
        rootParentIdToGroupId[img.rootParentId] = assignedGroupId;
        console.log(`  映射更新: 根父ID=${img.rootParentId} 映射到组ID=${assignedGroupId}`);
      }
    }
    
    // 3. 获取编辑历史记录
    console.log(`开始获取所有图片的编辑历史记录...`);
    
    // 不再从本地获取编辑历史
    
    // 存储所有编辑历史记录，按图片ID索引
    const allEditHistories = {};
    let totalHistoryRecords = 0;
    let historyFilesFound = 0;
    let historyFilesWithData = 0;
    
    // 获取所有图片组ID
    const imageGroupIds = Object.keys(imageGroups);
    console.log(`将从飞书获取 ${imageGroupIds.length} 个图片组的编辑历史`);
    
    // 使用Promise.all并行获取所有图片组的编辑历史
    await Promise.all(imageGroupIds.map(async (imageId) => {
      try {
        // 从飞书获取该图片的编辑历史
        const feishuHistories = await getEditHistoryFromFeishu(imageId);
        
        if (feishuHistories && feishuHistories.length > 0) {
          console.log(`从飞书获取到图片 ${imageId} 的 ${feishuHistories.length} 条编辑历史`);
          historyFilesWithData++;
          totalHistoryRecords += feishuHistories.length;
          
          // 标准化飞书获取的历史记录
          const normalizedHistory = feishuHistories.map((history, index) => {
            // 不再使用editGroupId
            
            return {
              id: history.id || `history-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              imageId: history.imageId || imageId,
              prompt: history.prompt || "未提供编辑提示词",
              resultImageId: history.resultImageId || "",
              createdAt: history.createdAt || new Date().toISOString(),
              type: history.type || "edit"
              // editGroupId字段已移除
            };
          });
          
          allEditHistories[imageId] = normalizedHistory;
          console.log(`存储从飞书获取的图片 ${imageId} 的 ${normalizedHistory.length} 条编辑历史记录`);
        }
      } catch (error) {
        console.error(`从飞书获取图片 ${imageId} 的编辑历史时出错:`, error);
      }
    }));
    
    // 不再需要遍历本地历史文件
    
    // 现在，将读取到的历史记录添加到相应的图片组中
    for (const groupId in imageGroups) {
      // 输出每个组的详细信息
      const group = imageGroups[groupId];
      console.log(`图片组详情 - ID: ${groupId}`);
      console.log(`  原始图片: ${group.original ? group.original.id : '无'}`);
      console.log(`  编辑图片数量: ${group.edits.length}`);
      
      // 输出编辑图片的具体信息
      group.edits.forEach((edit, i) => {
        console.log(`    编辑 #${i+1}: ID=${edit.id}, parentId=${edit.parentId || '无'}, rootParentId=${edit.rootParentId || '无'}`);
      });
      
      if (allEditHistories[groupId]) {
        // 当前图片组存在编辑历史记录
        imageGroups[groupId].editHistory = allEditHistories[groupId];
        console.log(`  编辑历史记录: ${allEditHistories[groupId].length} 条`);
        
        // 输出历史记录详情
        allEditHistories[groupId].forEach((history, index) => {
          console.log(`    历史 #${index+1}: 源图片=${history.imageId}, 结果图片ID=${history.resultImageId || '无'}, rootParentId=${history.rootParentId || '无'}`);
        });
      } else {
        console.log(`  编辑历史记录: 0 条`);
      }
    }
    
    // 我们将只使用rootParentId来组织编辑历史，不再使用复杂的图网络分析
    console.log('开始使用简化的rootParentId方法组织编辑历史...');
    
    // 使用之前建立的rootParentIdToGroupId映射关系处理编辑历史
    console.log('使用rootParentIdToGroupId映射关系处理编辑历史...');
    console.log('当前rootParentIdToGroupId映射关系:');
    for (const rootId in rootParentIdToGroupId) {
      console.log(`  rootParentId=${rootId} -> groupId=${rootParentIdToGroupId[rootId]}`);
    }
    
    // 重新组织所有编辑历史，根据rootParentId进行分组
    for (const imageId in allEditHistories) {
      const histories = allEditHistories[imageId];
      
      for (const history of histories) {
        let assignedGroupId = null;
        
        // 优先使用rootParentId和已建立的映射关系
        if (history.rootParentId) {
          // 先查找映射关系
          if (rootParentIdToGroupId[history.rootParentId]) {
            assignedGroupId = rootParentIdToGroupId[history.rootParentId];
            console.log(`历史记录 ${history.id} 通过rootParentId=${history.rootParentId}映射到组ID=${assignedGroupId}`);
          } 
          // 再直接查找组
          else if (imageGroups[history.rootParentId]) {
            assignedGroupId = history.rootParentId;
            console.log(`历史记录 ${history.id} 直接使用rootParentId=${history.rootParentId}作为组ID`);
          }
        }
        
        // 如果通过rootParentId找不到组，尝试其他方法
        if (!assignedGroupId) {
          // 尝试将历史记录添加到它所属的图片组
          if (imageGroups[imageId]) {
            assignedGroupId = imageId;
            console.log(`历史记录 ${history.id} 直接分配到源图片组ID=${imageId}`);
          }
          // 尝试使用结果图片ID
          else if (history.resultImageId) {
            // 先查找映射
            if (rootParentIdToGroupId[history.resultImageId]) {
              assignedGroupId = rootParentIdToGroupId[history.resultImageId];
              console.log(`历史记录 ${history.id} 通过resultImageId=${history.resultImageId}映射到组ID=${assignedGroupId}`);
            }
            // 再查找直接组
            else if (imageGroups[history.resultImageId]) {
              assignedGroupId = history.resultImageId;
              console.log(`历史记录 ${history.id} 通过resultImageId=${history.resultImageId}直接找到组ID`);
            }
          }
        }
        
        // 如果通过以上所有方法都找不到组，则创建新组
        if (!assignedGroupId) {
          assignedGroupId = history.rootParentId || imageId;
          console.log(`历史记录 ${history.id} 无法找到现有组，创建或使用组ID=${assignedGroupId}`);
          
          if (!imageGroups[assignedGroupId]) {
            imageGroups[assignedGroupId] = {
              original: null,
              edits: [],
              editHistory: []
            };
            console.log(`创建新组 ${assignedGroupId} 用于孤立的编辑历史记录`);
          }
        }
        
        // 将历史记录添加到已确定的组中，避免重复添加
        if (!imageGroups[assignedGroupId].editHistory.some(h => h.id === history.id)) {
          imageGroups[assignedGroupId].editHistory.push(history);
          console.log(`将历史记录 ${history.id} 添加到组 ${assignedGroupId}`);
        } else {
          console.log(`历史记录 ${history.id} 已存在于组 ${assignedGroupId}，跳过添加`);
        }
      }
    }
            


    
    // 解决没有原始图片的组
    console.log('检查并修复没有原始图片的组...');
    
    // 存储需要修复的组
    const groupsToFix = [];
    
    for (const groupId in imageGroups) {
      const group = imageGroups[groupId];
      
      if (group.original === null) {
        console.log(`组 ${groupId} 缺失原始图片，尝试修复...`);
        
        // 尝试使用其他组的原始图片
        // 查找 groupId 的图片作为原始图片
        let foundOriginal = false;
        for (const otherGroupId in imageGroups) {
          if (otherGroupId === groupId) continue; // 跳过自身
          
          const otherGroup = imageGroups[otherGroupId];
          if (otherGroup.original && otherGroup.original.id === groupId) {
            group.original = otherGroup.original;
            console.log(`  已找到并设置原始图片: ${otherGroup.original.id}`);
            foundOriginal = true;
            break;
          }
        }
        
        if (!foundOriginal) {
          // 如果还是没有找到合适的原始图片，则将组保存等待进一步处理
          groupsToFix.push(groupId);
          console.log(`  无法找到合适的原始图片，将组 ${groupId} 标记为需要修复`);
        }
      }
    }
    
    // 两种补救方案处理其余没有原始图片的组
    for (const groupId of groupsToFix) {
      const group = imageGroups[groupId];
      
      // 方案 1: 如果有编辑图片，将第一个编辑图片提升为原始图片
      if (group.edits.length > 0) {
        const promoted = group.edits.shift(); // 取出第一个编辑图片
        group.original = promoted;
        console.log(`  方案 1: 将图片 ${promoted.id} 提升为组 ${groupId} 的原始图片`);
        continue; // 已修复，跳过该组
      }
      
      // 方案 2: 如果组完全空白，则删除该组
      console.log(`  方案 2: 组 ${groupId} 没有原始图片也没有编辑图片，删除该组`);
      delete imageGroups[groupId];
    }
    
    // 4. 转换成数组形式返回
    const result = Object.values(imageGroups)
      // 过滤掉没有原始图片的记录
      .filter(group => group.original !== null)
      // 按照原始图片的创建时间排序，最新的排在前面
      .sort((a, b) => {
        const dateA = new Date(a.original.createdAt).getTime();
        const dateB = new Date(b.original.createdAt).getTime();
        return dateB - dateA;
      });
    
    // 处理没有正确分组的图片
    console.log('\n检查二次编辑图片是否都正确显示...');
    
    // 创建编辑图片ID到组ID的映射
    const editToGroupMap = {};
    for (const groupId in imageGroups) {
      const group = imageGroups[groupId];
      group.edits.forEach(edit => {
        editToGroupMap[edit.id] = groupId;
      });
    }
    
    // 检查所有图片，找出没有被分组的编辑图片
    const unassignedImages = [];
    for (const img of allImages) {
      if (!img || !img.id) continue;
      if (!img.parentId) continue; // 只检查编辑图片
      
      // 检查这个编辑图片是否已经分组
      if (!editToGroupMap[img.id]) {
        unassignedImages.push(img);
        console.log(`发现未分组的图片: ${img.id}, parentId=${img.parentId}, rootParentId=${img.rootParentId || '无'}`);
      }
    }
    
    console.log(`发现 ${unassignedImages.length} 张未分组的编辑图片`);
    
    // 修复图片组
    for (const img of unassignedImages) {
      // 优先级 1: 先查找是否有rootParentId对应的组 - 这是最优先的选择
      if (img.rootParentId && imageGroups[img.rootParentId]) {
        console.log(`优先分组: 根据rootParentId将未分组的图片 ${img.id} 添加到组 ${img.rootParentId}`);
        imageGroups[img.rootParentId].edits.push(img);
        console.log(`  图片详情: ID=${img.id}, 父ID=${img.parentId}, 根父ID=${img.rootParentId}`);
        continue;
      }
      
      // 优先级 2: 再查找是否有parentId对应的组
      if (imageGroups[img.parentId]) {
        console.log(`二级分组: 根据parentId将未分组的图片 ${img.id} 添加到组 ${img.parentId}`);
        imageGroups[img.parentId].edits.push(img);
        console.log(`  图片详情: ID=${img.id}, 父ID=${img.parentId}, 根父ID=${img.rootParentId || '无'}`);
        continue;
      }
      
      // 如果未能找到合适的组，创建一个新组
      console.log(`无法找到适合的组，为图片 ${img.id} 创建新组`);
      imageGroups[img.id] = {
        original: null,  // 初始为空
        edits: [img],   // 将当前图片添加到编辑列表
        editHistory: []
      };
      
      // 检查是否可以找到对应的原始图片
      for (const origImg of allImages) {
        if (origImg.id === img.parentId || origImg.id === img.rootParentId) {
          console.log(`为新组 ${img.id} 找到了原始图片 ${origImg.id}`);
          imageGroups[img.id].original = origImg;
          break;
        }
      }
    }
    
    // 生成统计数据
    const stats = {
      originalImages: originalImageCount,
      editedImages: editedImageCount,
      historyRecords: totalHistoryRecords,
      historyFilesFound: historyFilesFound,
      historyFilesWithData: historyFilesWithData,
      emptyPrompts: emptyPromptCount,
      filteredGroups: Object.keys(imageGroups).length,
      allGroups: Object.keys(imageGroups).length,
      unassignedImages: unassignedImages.length,

      // editGroupId已移除，不再统计编辑组相关信息
      missingImages: Object.values(imageGroups).reduce((count, group) => {
        // 统计编辑历史中没有对应图片的记录数
        return count + group.editHistory.filter(h => {
          // 检查编辑历史中的resultImageId是否在edits数组中存在
          return h.resultImageId && !group.edits.some(edit => edit.id === h.resultImageId);
        }).length;
      }, 0)
    };
    
    console.log('\n\n数据统计汇总:', stats);
    console.log('=============================================\n\n');
    
    // 去除重复历史记录
    for (const groupId in imageGroups) {
      // 创建一个集合来跟踪已经处理过的历史记录ID
      const processedHistoryIds = new Set<string>();
      const uniqueHistories: EditHistory[] = [];
      
      // 去除重复项
      for (const history of imageGroups[groupId].editHistory) {
        if (!processedHistoryIds.has(history.id)) {
          processedHistoryIds.add(history.id);
          uniqueHistories.push(history);
        }
      }
      
      // 替换为去重后的数组
      imageGroups[groupId].editHistory = uniqueHistories;
      console.log(`组 ${groupId} 去重后有 ${uniqueHistories.length} 条历史记录`);
    }
    
    // 删除未分配历史记录的处理代码
    
    // 已删除未分配历史记录统计相关代码
    
    // 删除图网络的额外统计信息，我们不再使用图网络处理编辑历史
    console.log('不再使用图网络处理编辑历史，简化编辑历史逻辑');
    
    // 已删除未分配历史原因统计相关代码
    
    // 升级的统计信息
    const enhancedStats = {
      ...stats
    };
    
    return NextResponse.json({
      success: true,
      data: {
        imageGroups: result,
        total: result.length,
        stats: enhancedStats
      }
    } as ApiResponse);
    
  } catch (error) {
    console.error("获取图片及历史记录失败:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "GET_IMAGES_HISTORY_FAILED",
        message: "获取图片及历史记录失败",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
