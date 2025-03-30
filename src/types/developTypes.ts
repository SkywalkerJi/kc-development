// 开发池接口
export interface DevelopmentPool {
  开发池名称: string;
  开发池ID: number;
  舰种?: string[];
  舰型?: string[];
  舰名?: string[];
  舰ID?: number[];
  不包含舰ID?: number[];
  最低资源?: number[];
  出货率?: Record<string, number>;
}

// 开发池类
export class DevelopmentPoolClass implements DevelopmentPool {
  开发池名称: string = '';
  开发池ID: number = 0;
  舰种?: string[];
  舰型?: string[];
  舰名?: string[];
  舰ID?: number[] = [];
  不包含舰ID?: number[];
  最低资源?: number[];
  出货率?: Record<string, number>;
  private text: string = '';

  // 初始化方法
  init(ctypeMap: Record<number, string>, getIDs: (names: string[], exact: boolean) => number[], shipList: Record<number, any>): void {
    this.text = '';
    
    // 处理舰种信息
    if (this.舰种) {
      for (const item of this.舰种) {
        this.text += item + ',';
      }
    }
    
    // 处理舰型信息
    if (this.舰型) {
      for (const item of this.舰型) {
        const typeId = Number(item);
        if (!isNaN(typeId)) {
          if (ctypeMap[typeId]) {
            this.text += ctypeMap[typeId] + ',';
          }
        } else {
          this.text += item + ',';
        }
      }
    }
    
    // 处理舰名信息
    if (this.舰名) {
      for (const item of this.舰名) {
        this.text += item + ',';
      }
    }
    
    // 处理不包含的舰ID
    if (this.不包含舰ID) {
      this.text += '不包含';
      for (const id of this.不包含舰ID) {
        if (shipList[id]) {
          this.text += shipList[id].name + '(' + id + '),';
        }
      }
    }
    
    // 处理舰ID
    if (this.舰ID) {
      for (const id of this.舰ID) {
        if (shipList[id]) {
          this.text += shipList[id].name + '(' + id + '),';
        }
      }
    }
    
    // 处理最低资源
    if (this.最低资源) {
      if (this.最低资源[0] > 0) {
        this.text += '最低油' + this.最低资源[0] + ',';
      }
      if (this.最低资源[1] > 0) {
        this.text += '最低弹' + this.最低资源[1] + ',';
      }
      if (this.最低资源[2] > 0) {
        this.text += '最低钢' + this.最低资源[2] + ',';
      }
      if (this.最低资源[3] > 0) {
        this.text += '最低铝' + this.最低资源[3] + ',';
      }
    }
    
    // 处理文本格式
    if (this.text.length > 0) {
      this.text = this.text.substring(0, this.text.length - 1);
    } else {
      this.text = '过滤条件有点问题';
    }
    
    // 初始化舰ID列表
    if (!this.舰ID) {
      this.舰ID = [];
    }
    
    // 处理舰种筛选
    if (this.舰种) {
      const shipTypeIds: number[] = [];
      
      // 将舰种名称转换为ID
      for (const typeName of this.舰种) {
        // 使用枚举映射舰种名称到ID
        const typeId = ShipType[typeName as keyof typeof ShipType];
        if (typeId !== undefined) {
          shipTypeIds.push(typeId);
        }
      }
      
      // 查找符合舰种的舰船
      for (const [idStr, ship] of Object.entries(shipList)) {
        const id = parseInt(idStr);
        if (id < 1500 && shipTypeIds.includes(ship.stype)) {
          if (!this.舰ID.includes(id)) {
            this.舰ID.push(id);
          }
        }
      }
    }
    
    // 处理舰型筛选
    if (this.舰型) {
      const ctypeIds: number[] = [];
      
      // 将舰型名称或ID转换为舰型ID
      for (const typeStr of this.舰型) {
        if (!isNaN(Number(typeStr))) {
          ctypeIds.push(Number(typeStr));
          continue;
        }
        
        // 查找舰型ID
        for (const [idStr, name] of Object.entries(ctypeMap)) {
          if (name === typeStr) {
            ctypeIds.push(Number(idStr));
            break;
          }
        }
      }
      
      // 查找符合舰型的舰船
      for (const [idStr, ship] of Object.entries(shipList)) {
        const id = parseInt(idStr);
        if (id < 1500 && ctypeIds.includes(ship.ctype)) {
          if (!this.舰ID.includes(id)) {
            this.舰ID.push(id);
          }
        }
      }
    }
    
    // 处理舰名筛选
    if (this.舰名) {
      const nameIds = getIDs(this.舰名, false);
      
      // 添加舰名对应的舰ID
      for (const id of nameIds) {
        if (!this.舰ID.includes(id)) {
          this.舰ID.push(id);
        }
      }
    }
    
    // 处理不包含舰ID
    if (this.不包含舰ID) {
      for (const id of this.不包含舰ID) {
        const index = this.舰ID.indexOf(id);
        if (index !== -1) {
          this.舰ID.splice(index, 1);
        }
      }
    }
  }

  // 转为字符串表示
  toString(): string {
    return this.开发池名称 + '(' + this.text + ')';
  }
}

// 开发结果接口
export interface DevelopResult {
  池名: string;
  池ID: number;
  公式: number[];
  总资源: number;
  出货率: number;
  失败率: number;
  池类型?: string;
}

// 开发结果类
export class DevelopResultClass implements DevelopResult {
  池名: string = '';
  池ID: number = 0;
  公式: number[] = [];
  总资源: number = 0;
  出货率: number = 0;
  失败率: number = 0;
  
  // 获取池类型
  get 池类型(): string {
    switch (this.池ID) {
      case 1:
        return '铝';
      case 2:
        return '弹';
      case 3:
        return '油钢';
      default:
        throw new Error('无效的池ID');
    }
  }
}

// 舰种枚举 - 与C#完全一致
export enum ShipType {
  NULL = 0,
  DE = 1,
  DD = 2,
  CL = 3,
  CLT = 4,
  CA = 5,
  CAV = 6,
  CVL = 7,
  FBB = 8,
  BB = 9,
  BBV = 10,
  CV = 11,
  超弩級戦艦 = 12,
  SS = 13,
  SSV = 14,
  敌AO = 15,
  AV = 16,
  LHA = 17,
  CVB = 18,
  AR = 19,
  AS = 20,
  CT = 21,
  AO = 22
} 