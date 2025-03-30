export interface Api_ShipInfo {
  id: number;
  name: string;
  yomi: string;
  stype: number;
  ctype: number;
  速度: number;
  最大燃料?: number;
  最大弹药?: number;
  afterid: number;
  舰种: number;
  耐久?: number;
  装甲?: number;
  火力?: number;
  雷装?: number;
  对空?: number;
  运?: number;
  射程?: number;
  回避?: number;
  对潜?: number;
  索敌?: number;
  索敌max?: number;
  火力max?: number;
  雷装max?: number;
  对潜max?: number;
  搭载: number[];
  装备: number[];
  制空: number;
  陆航制空: number;
  装甲plus: number;
  火力plus: number;
  雷装plus: number;
  对空plus: number;
  回避plus: number;
  对潜plus: number;
  索敌plus: number;
  爆装: number;
  命中: number;
  火力_空母: number;
  加权对空: number;
  舰队防空: number;
  命中项_炮击: number;
  夜战攻击类型: number;
  装备个数: Record<string, number>;
  打孔装备?: Record<number, number>;
  打孔装备图标?: Record<number, number>;
  携带攻击机?: boolean;
  level?: number;
  samename?: boolean;
  耐久max?: number; 
  对空max?: number;
  装甲max?: number;
  旗舰夜战攻击发动率?: number;
  僚舰夜战攻击发动率?: number;
  
  // 方法
  GetFullName?: () => string;
  GetName?: () => string;
  空母系火力公式?: () => boolean;
  当前素对潜?: (level: number) => number;
}

// 实现接口的舰船信息类
export class ShipInfo implements Api_ShipInfo {
  id: number = 0;
  name: string = '';
  yomi: string = '';
  stype: number = 0;
  ctype: number = 0;
  速度: number = 0;
  最大燃料?: number;
  最大弹药?: number;
  afterid: number = 0;
  舰种: number = 0;
  耐久?: number;
  装甲?: number;
  火力?: number;
  雷装?: number;
  对空?: number;
  运?: number;
  射程?: number;
  回避?: number;
  对潜?: number;
  索敌?: number;
  索敌max?: number;
  火力max?: number;
  雷装max?: number;
  对潜max?: number;
  搭载: number[] = [];
  装备: number[] = [];
  制空: number = 0;
  陆航制空: number = 0;
  装甲plus: number = 0;
  火力plus: number = 0;
  雷装plus: number = 0;
  对空plus: number = 0;
  回避plus: number = 0;
  对潜plus: number = 0;
  索敌plus: number = 0;
  爆装: number = 0;
  命中: number = 0;
  火力_空母: number = 0;
  加权对空: number = 0;
  舰队防空: number = 0;
  命中项_炮击: number = 0;
  夜战攻击类型: number = 0;
  装备个数: Record<string, number> = {
    "主炮": 0,
    "副炮": 0,
    "鱼雷": 0
  };
  打孔装备?: Record<number, number>;
  打孔装备图标?: Record<number, number>;
  携带攻击机?: boolean;
  level?: number;
  samename?: boolean;
  耐久max?: number;
  对空max?: number;
  装甲max?: number;
  旗舰夜战攻击发动率?: number;
  僚舰夜战攻击发动率?: number;
  
  // 根据C#实现的方法
  GetFullName(): string {
    return `${this.name}${this.yomi}(${this.id})`;
  }
  
  GetName(): string {
    return `${this.name}${this.yomi}`;
  }
  
  空母系火力公式(): boolean {
    if (this.舰种 === 7 || this.舰种 === 11 || this.舰种 === 18 || (this.速度 === 0 && this.携带攻击机)) {
      return true;
    }
    return false;
  }
  
  当前素对潜(level: number): number {
    if (this.对潜 === undefined || this.对潜max === undefined) return 0;
    return Math.floor(this.对潜 + (this.对潜max - this.对潜) * level / 99);
  }
}

export interface SameShip {
  name: string;
  ids: number[];
  next: number;
}

// 实现同型舰类
export class SameShipClass implements SameShip {
  name: string = '';
  ids: number[] = [];
  next: number = 0;
}

export interface Api_Mst_Stype {
  api_id: number;
  api_sortno: number;
  api_name: string;
  api_scnt: number;
  api_kcnt: number;
  api_equip_type: Record<number, number>;
}

export class Mst_Stype implements Api_Mst_Stype {
  api_id: number = 0;
  api_sortno: number = 0;
  api_name: string = '';
  api_scnt: number = 0;
  api_kcnt: number = 0;
  api_equip_type: Record<number, number> = {};
}

export interface Api_Mst_Equip_Ship {
  api_ship_id: number;
  api_equip_type: number[];
}

export class Mst_Equip_Ship implements Api_Mst_Equip_Ship {
  api_ship_id: number = 0;
  api_equip_type: number[] = [];
}

export interface Api_Mst_Equip_Exslot_Ship {
  api_ship_ids?: Record<number, number>;
  api_stypes?: Record<number, number>;
  api_ctypes?: Record<number, number>;
  api_req_level: number;
}

export class Mst_Equip_Exslot_Ship implements Api_Mst_Equip_Exslot_Ship {
  api_ship_ids?: Record<number, number>;
  api_stypes?: Record<number, number>;
  api_ctypes?: Record<number, number>;
  api_req_level: number = 0;
} 