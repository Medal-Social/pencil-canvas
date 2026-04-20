export type NodeType = 'frame' | 'group' | 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'path' | 'text' | 'icon_font' | 'image' | 'ref';

export interface PenNode {
  id: string;
  type: NodeType;
  name?: string;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  fill?: string | GradientFill;
  stroke?: StrokeDef;
  opacity?: number;
  cornerRadius?: number | [number, number, number, number];
  layout?: 'none' | 'vertical' | 'horizontal';
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  justifyContent?: 'start' | 'center' | 'end' | 'space_between';
  alignItems?: 'start' | 'center' | 'end';
  children?: PenNode[];
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  textGrowth?: 'auto' | 'fixed-width' | 'fixed-width-height';
  iconFontFamily?: string;
  iconFontName?: string;
  geometry?: string;
  viewBox?: [number, number, number, number];
  clip?: boolean;
  effect?: EffectDef | EffectDef[];
}

export interface GradientFill {
  type: 'gradient';
  gradientType?: 'linear' | 'radial';
  rotation?: number;
  colors?: { color: string; position: number }[];
}

export interface StrokeDef {
  align?: 'inside' | 'center' | 'outside';
  thickness?: number;
  fill?: string;
}

export interface EffectDef {
  type: 'shadow' | 'blur' | 'background_blur';
  shadowType?: 'inner' | 'outer';
  offset?: { x: number; y: number };
  spread?: number;
  blur?: number;
  color?: string;
}

export interface ResolvedNode extends PenNode {
  resolvedX: number;
  resolvedY: number;
  resolvedWidth: number;
  resolvedHeight: number;
  children?: ResolvedNode[];
}
