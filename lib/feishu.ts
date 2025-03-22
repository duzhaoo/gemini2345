import axios from 'axios';
import FormData from 'form-data';

// 飞书API配置
const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const APP_TOKEN = process.env.FEISHU_APP_TOKEN || ''; // 使用APP_TOKEN代替BITABLE_ID
const TABLE_ID = process.env.FEISHU_TABLE_ID || '';
const BASE_URL = 'https://open.feishu.cn/open-apis';

// 缓存token
let accessToken = '';
let tokenExpireTime = 0;

/**
 * 获取飞书访问令牌
 * @returns {Promise<string>} 访问令牌
 */
export async function getAccessToken() {
  // 检查缓存的token是否有效
  if (accessToken && tokenExpireTime > Date.now()) {
    console.log(`getAccessToken: 使用缓存的访问令牌，剩余有效期: ${Math.round((tokenExpireTime - Date.now()) / 1000)}秒`);
    return accessToken;
  }
  
  try {
    console.log(`getAccessToken: 缓存令牌已过期或不存在，正在获取新令牌，APP_ID: ${APP_ID}`);
    
    const response = await axios.post(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
      app_id: APP_ID,
      app_secret: APP_SECRET
    });
    
    console.log(`getAccessToken: 收到令牌请求响应，状态码: ${response.data.code}`);
    
    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpireTime = Date.now() + (response.data.expire - 300) * 1000;
      console.log(`getAccessToken: 成功获取新令牌，有效期: ${response.data.expire}秒，实际使用${response.data.expire - 300}秒`);
      return accessToken;
    } else {
      console.error(`getAccessToken: 获取令牌失败，错误码: ${response.data.code}, 消息: ${response.data.msg}`);
      throw new Error(`获取飞书访问令牌失败: ${response.data.msg}`);
    }
  } catch (error: any) {
    console.error('getAccessToken: 获取飞书访问令牌出错:', {
      message: error?.message,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      responseData: error?.response?.data
    });
    throw error;
  }
}

/**
 * 上传图片到飞书文件存储
 * @param {string} imageData - 图片的Base64数据
 * @param {string} fileName - 文件名
 * @param {string} mimeType - MIME类型
 * @returns {Promise<{fileToken: string, url: string, name: string}>} 上传结果
 */
export async function uploadImageToFeishu(imageData: string, fileName: string, mimeType: string) {
  try {
    console.log("======= 飞书图片上传开始 =======");
    console.log(`uploadImageToFeishu: 开始上传图片到飞书，文件名: ${fileName}, MIME类型: ${mimeType}`);
    console.log(`uploadImageToFeishu: 环境变量检查 - APP_ID存在: ${!!APP_ID}, APP_SECRET存在: ${!!APP_SECRET}, APP_TOKEN存在: ${!!APP_TOKEN}`);
    
    const token = await getAccessToken();
    console.log(`uploadImageToFeishu: 获取飞书access_token成功，令牌长度: ${token.length}`);
    
    // 将base64转换为Buffer
    const imageBuffer = Buffer.from(imageData, 'base64');
    console.log(`uploadImageToFeishu: 成功将Base64转换为Buffer，大小: ${imageBuffer.length} 字节`);
    
    // 使用飞书文档中的图片上传API
    const formData = new FormData();
    formData.append('image_type', 'message');
    formData.append('image', imageBuffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    console.log(`uploadImageToFeishu: 已准备FormData，准备调用API: ${BASE_URL}/im/v1/images`);
    
    const response = await axios.post(
      `${BASE_URL}/im/v1/images`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log(`uploadImageToFeishu: 收到飞书上传响应，状态码: ${response.status}, 数据代码: ${response.data.code}`);
    
    if (response.data.code === 0) {
      const imageKey = response.data.data.image_key;
      const url = `${BASE_URL}/im/v1/images/${imageKey}`;
      
      console.log(`uploadImageToFeishu: 图片上传成功! image_key: ${imageKey}`);
      console.log(`uploadImageToFeishu: 完整URL: ${url}`);
      console.log("======= 飞书图片上传完成 =======");
      
      return {
        fileToken: imageKey,
        url: url,
        name: fileName
      };
    } else {
      console.error(`uploadImageToFeishu: 上传失败! 错误码: ${response.data.code}, 消息: ${response.data.msg}`);
      throw new Error(`上传图片失败，响应: ${JSON.stringify(response.data)}`);
    }
  } catch (error: any) {
    // 增强错误日志
    console.error('======= 飞书图片上传错误 =======');
    console.error(`uploadImageToFeishu: 上传图片到飞书出错，类型: ${error?.name}，消息: ${error?.message}`);
    
    if (error.response) {
      console.error('uploadImageToFeishu: 收到错误响应:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      });
    } else if (error.request) {
      console.error('uploadImageToFeishu: 已发送请求但未收到响应:', {
        method: error.request.method,
        path: error.request.path,
        host: error.request.host
      });
    } else {
      console.error(`uploadImageToFeishu: 发送请求前出错: ${error.message}`);
      console.error(`uploadImageToFeishu: 错误堆栈: ${error.stack}`);
    }
    
    // 重要：修改为返回带有错误标记的对象，而不是模拟成功响应
    // 这样可以更容易地追踪问题
    console.error("uploadImageToFeishu: 返回错误标记，图片上传失败");
    return {
      fileToken: `error-${Date.now()}`,
      url: `/generated-images/${fileName}`, // 使用本地路径作为备份
      name: fileName,
      error: true,
      errorMessage: error?.message || '未知错误'
    };
  }
}

/**
 * 保存图片记录到多维表格
 * @param {object} imageData - 图片元数据
 * @returns {Promise<object>} 保存结果
 */
export async function saveImageRecord(imageData: {
  id: string;
  url: string;
  fileToken: string;
  prompt: string;
  timestamp: number;
  parentId?: string;
  rootParentId?: string; // 添加rootParentId字段，用于跟踪编辑链的根图片
  type?: string; // 预留字段，暂不发送到飞书
  // editGroupId字段已被移除，仅使用parentId进行编辑历史构建
}) {
  try {
    console.log(`saveImageRecord: 开始获取访问令牌...`);
    const token = await getAccessToken();
    console.log(`saveImageRecord: 成功获取访问令牌`);
    
    // 对时间进行格式化处理
    let formattedDate = new Date().toISOString();
    console.log(`saveImageRecord: 格式化时间戳，ISO格式: ${formattedDate}`);
    
    // 准备完整的请求体，包含更多字段以保存完整的编辑历史
    const fields: any = {
      id: imageData.id,
      prompt: imageData.prompt,
      url: imageData.url,
      timestamp: formattedDate // 使用ISO格式的时间戳
    };
    
    // 添加父图片ID（如果存在）
    if (imageData.parentId) {
      fields.parentId = imageData.parentId;
      console.log(`saveImageRecord: 添加父图片ID: ${imageData.parentId}`);
    }
    
    // 添加根父图片ID（如果存在）
    if (imageData.rootParentId) {
      fields.rootParentId = imageData.rootParentId;
      console.log(`saveImageRecord: 添加根父图片ID: ${imageData.rootParentId}`);
    }
    
    // 添加类型字段（如果存在）
    if (imageData.type) {
      fields.type = imageData.type; // 飞书表格已添加type字段，可以正常发送
      console.log(`saveImageRecord: 添加图片类型: ${imageData.type}`);
    }
    
    // 添加fileToken（如果存在）
    if (imageData.fileToken) {
      fields.fileToken = imageData.fileToken;
      console.log(`saveImageRecord: 添加fileToken: ${imageData.fileToken}`);
    }
    
    // editGroupId已移除，不再设置
    
    const requestBody = {
      fields
    };
    
    console.log(`saveImageRecord: 请求体详情:`, JSON.stringify(requestBody, null, 2));
    console.log(`saveImageRecord: 飞书参数 - APP_TOKEN: ${APP_TOKEN}, TABLE_ID: ${TABLE_ID}`);
    
    // 定义API请求URL
    const apiUrl = `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;
    console.log(`saveImageRecord: 请求URL: ${apiUrl}`);
    
    // 发送API请求
    const response = await axios({
      method: 'POST',
      url: apiUrl,
      data: requestBody,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`saveImageRecord: 收到响应，状态码: ${response.status}`);
    
    // 打印完整响应
    console.log(`saveImageRecord: 完整响应数据:`, JSON.stringify(response.data, null, 2));

    // 处理响应结果
    if (response.data && response.data.code === 0) {
      console.log(`saveImageRecord: 成功保存记录，ID: ${response.data.data?.record?.record_id}`);
      return {
        id: imageData.id,
        record_id: response.data.data?.record?.record_id || 'unknown'
      };
    } else {
      console.error(`saveImageRecord: 保存失败，错误码: ${response.data?.code}, 错误字段: ${response.data?.data?.invalid_field || '未知'}, 消息: ${response.data?.msg}`);
      return { id: imageData.id, record_id: 'error' };
    }
  } catch (error: any) {
    // 错误处理
    console.error('saveImageRecord: 保存飞书记录出错:');
    if (error.response) {
      console.error('saveImageRecord: API错误响应:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else {
      console.error(`saveImageRecord: 错误详情: ${error.message}`);
    }
    
    // 出错时返回默认值，而不是抛出异常
    return { id: imageData.id, record_id: 'error' };
  }
}

/**
 * 获取所有图片记录
 * @returns {Promise<Array>} 图片记录列表
 */
export async function getImageRecords() {
  try {
    const token = await getAccessToken();
    
    // 获取记录列表，不指定排序（避免InvalidSort错误）
    const response = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          page_size: 100  // 获取最多100条记录
        }
      }
    );
    
    if (response.data.code === 0) {
      // 转换数据格式
      return response.data.data.items.map((item: any) => {
        const fields = item.fields || {};
        
        // 打印飞书返回的字段信息，用于调试
        console.log('飞书记录字段:', JSON.stringify(fields));
        
        // 处理附件字段
        let fileToken = '';
        if (fields.attachment && Array.isArray(fields.attachment) && fields.attachment.length > 0) {
          fileToken = fields.attachment[0].file_token || '';
        }
        
        // 处理timestamp字段（现在为文本格式）
        let timestamp = Date.now();
        if (fields.timestamp) {
          if (typeof fields.timestamp === 'string') {
            // 尝试解析中文日期格式，如果失败则使用当前时间
            try {
              // 检测是否包含中文日期格式的分隔符
              if (fields.timestamp.includes('年') || fields.timestamp.includes('/')) {
                // 使用当前时间戳，因为中文日期格式不易解析为时间戳
                console.log('检测到中文日期格式:', fields.timestamp);
              } else if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                // ISO格式或类似标准格式
                timestamp = new Date(fields.timestamp).getTime();
              } else if (!isNaN(Number(fields.timestamp))) {
                // 尝试作为数字解析
                timestamp = Number(fields.timestamp);
              }
            } catch (e) {
              console.warn('解析timestamp字段失败:', e);
            }
          } else if (typeof fields.timestamp === 'number') {
            timestamp = fields.timestamp;
          }
        }
        
        return {
          id: fields.id || item.record_id || 'unknown', // 使用record_id作为备选
          url: fields.url || '',
          fileToken: fileToken,
          prompt: fields.prompt || '',
          timestamp: timestamp,
          parentId: fields.parentId || null
        };
      });
    } else {
      throw new Error(`获取记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取飞书记录出错:', error);
    throw error;
  }
}

/**
 * 从飞书获取特定图片的编辑历史记录
 * @param {string} imageId - 图片ID
 * @returns {Promise<Array>} 编辑历史记录列表
 */
export async function getEditHistoryFromFeishu(imageId: string) {
  try {
    const token = await getAccessToken();
    
    // 查询与此图片相关的所有记录
    const response = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          page_size: 100, // 获取最多100条记录
          filter: `CurrentValue.[parentId] = "${imageId}" OR CurrentValue.[id] = "${imageId}" OR CurrentValue.[rootParentId] = "${imageId}"` // 增强过滤条件，同时包含rootParentId
        }
      }
    );
    
    if (response.data.code === 0) {
      // 转换数据格式为编辑历史格式
      return response.data.data.items.map((item: any) => {
        const fields = item.fields || {};
        
        // 处理timestamp字段
        let createdAt = new Date().toISOString();
        if (fields.timestamp) {
          try {
            if (typeof fields.timestamp === 'string') {
              if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                createdAt = fields.timestamp;
              } else if (!isNaN(Number(fields.timestamp))) {
                createdAt = new Date(Number(fields.timestamp)).toISOString();
              }
            } else if (typeof fields.timestamp === 'number') {
              createdAt = new Date(fields.timestamp).toISOString();
            }
          } catch (e) {
            console.warn('解析timestamp字段失败:', e);
          }
        }
        
        return {
          id: fields.id || item.record_id || 'unknown',
          imageId: fields.parentId || '', // 父图片ID作为被编辑的图片ID
          prompt: fields.prompt || '',
          resultImageId: fields.id || '', // 当前图片ID作为结果图片ID
          rootParentId: fields.rootParentId || '', // 添加rootParentId字段
          // editGroupId字段已移除
          createdAt: createdAt
        };
      }).filter((history: any) => {
        // 过滤掉不符合编辑历史要求的数据
        return history.imageId && history.resultImageId && history.id !== imageId;
      });
    } else {
      throw new Error(`获取编辑历史记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('从飞书获取编辑历史出错:', error);
    return []; // 出错时返回空数组
  }
}
