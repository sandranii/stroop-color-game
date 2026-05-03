import { GameConfig, GameVariant } from './game.config';
import { GameQuestion, QuestionToken } from './question-generator';

interface ExportPptOptions {
  config: GameConfig;
  questions: GameQuestion[];
  variant: GameVariant;
  advancedBackgroundEnabled: boolean;
}

const SLIDE_WIDTH = 13.33;
const SLIDE_HEIGHT = 7.5;
const SLIDE_BACKGROUND = 'F8FAFC';
const QUESTION_STAGE_BACKGROUND = 'DDDDDD';
const CARD_BACKGROUND = 'FFFFFF';
const TEXT_DARK = '0F172A';
const TEXT_MUTED = '475569';
const ACCENT = '0F766E';
const BORDER = 'CBD5E1';

export async function exportGameQuestionsPpt(options: ExportPptOptions): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenAI Codex';
  pptx.company = 'Stroop Color Game';
  pptx.subject = 'Stroop color game questions';
  pptx.title = `看字說顏色 ${options.variant === 'basic' ? '基礎版' : '進階版'}`;
  pptx.theme = {
    headFontFace: 'Noto Sans TC',
    bodyFontFace: 'Noto Sans TC'
  };

  addIntroSlide(pptx, options.variant, options.advancedBackgroundEnabled);
  addExampleSlide(pptx, options);
  options.questions.forEach((question, index) => addQuestionSlide(pptx, question, index + 1, options));
  addAnswerSummarySlide(pptx, options.questions);

  await pptx.writeFile({ fileName: buildFileName(options.variant) });
}

function addIntroSlide(pptx: any, variant: GameVariant, advancedBackgroundEnabled: boolean): void {
  const slide = createBaseSlide(pptx);
  const rules = variant === 'basic'
    ? [
        '回答每個字實際顯示的顏色，不是文字內容。',
        '依序回答整題所有字，全部答對才算完成該題。'
      ]
    : [
        '有方框時回答文字內容，沒有方框時回答顯示顏色。',
        '依序回答整題所有字，全部答對才算完成該題。'
        // advancedBackgroundEnabled ? '背景色只是干擾，不是答案。' : '請依照是否有方框判斷回答規則。'
      ];

  slide.addText('看字說顏色', {
    x: 0.75, y: 0.55, w: 6.2, h: 0.7,
    fontFace: 'Noto Sans TC',
    fontSize: 28,
    bold: true,
    color: TEXT_DARK,
    margin: 0
  });
  slide.addText(`${variant === 'basic' ? '基礎版' : '進階版'} 題目說明`, {
    x: 0.75, y: 1.25, w: 4.8, h: 0.45,
    fontFace: 'Noto Sans TC',
    fontSize: 16,
    bold: true,
    color: ACCENT,
    margin: 0
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 1.95, w: 11.83, h: 4.8,
    rectRadius: 0.08,
    fill: { color: CARD_BACKGROUND },
    line: { color: BORDER, pt: 1.2 }
  });

  rules.forEach((rule, index) => {
    slide.addText(`${index + 1}. ${rule}`, {
      x: 1.15, y: 2.45 + index * 0.82, w: 9.4, h: 0.4,
      fontFace: 'Noto Sans TC',
      fontSize: 21,
      color: TEXT_DARK,
      margin: 0
    });
  });
}

function addExampleSlide(pptx: any, options: ExportPptOptions): void {
  const slide = createBaseSlide(pptx);
  const basicExample = buildExampleTokens(options);

  slide.addText('範例', {
    x: 0.75, y: 0.55, w: 3.5, h: 0.65,
    fontFace: 'Noto Sans TC',
    fontSize: 26,
    bold: true,
    color: TEXT_DARK,
    margin: 0
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 1.35, w: 11.83, h: 4.05,
    rectRadius: 0.08,
    fill: { color: QUESTION_STAGE_BACKGROUND },
    line: { color: BORDER, pt: 1 }
  });

  if (options.variant === 'basic') {
    drawTokenRow(slide, basicExample, 1.25, 2.02, 10.85, 2.7, 4);
    slide.addText('回答每個字的顯示顏色', {
      x: 0.95, y: 5.72, w: 4.2, h: 0.38,
      fontFace: 'Noto Sans TC',
      fontSize: 18,
      bold: true,
      color: TEXT_DARK,
      margin: 0
    });
    slide.addText(`範例答案：${basicExample.map((token) => token.colorName).join('、')}`, {
      x: 0.95, y: 6.1, w: 6.8, h: 0.38,
      fontFace: 'Noto Sans TC',
      fontSize: 18,
      color: TEXT_MUTED,
      margin: 0
    });
    return;
  }

  const advancedExample = buildAdvancedExampleTokens(options);
  drawTokenRow(slide, advancedExample, 1.25, 2.02, 10.85, 2.7, 4);
  slide.addText('有框答文字，沒框答顏色', {
    x: 0.95, y: 5.72, w: 4.4, h: 0.38,
    fontFace: 'Noto Sans TC',
    fontSize: 18,
    bold: true,
    color: TEXT_DARK,
    margin: 0
  });
  slide.addText(`範例答案：${advancedExample.map((token) => token.answer).join('、')}`, {
    x: 0.95, y: 6.1, w: 7.2, h: 0.38,
    fontFace: 'Noto Sans TC',
    fontSize: 18,
    color: TEXT_MUTED,
    margin: 0
  });
}

function addQuestionSlide(
  pptx: any,
  question: GameQuestion,
  questionNumber: number,
  options: ExportPptOptions
): void {
  const slide = createBaseSlide(pptx);
  slide.addText(`第 ${questionNumber} 題`, {
    x: 0.75, y: 0.55, w: 2.3, h: 0.5,
    fontFace: 'Noto Sans TC',
    fontSize: 22,
    bold: true,
    color: TEXT_DARK,
    margin: 0
  });
  slide.addText(options.variant === 'basic' ? '請依序回答每個字的顯示顏色' : '請依序作答，有框答字、沒框答顏色', {
    x: 9.1, y: 0.58, w: 3.45, h: 0.34,
    fontFace: 'Noto Sans TC',
    fontSize: 12.5,
    color: TEXT_MUTED,
    align: 'right',
    margin: 0
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 1.35, w: 11.83, h: 5.3,
    rectRadius: 0.08,
    fill: { color: QUESTION_STAGE_BACKGROUND },
    line: { color: BORDER, pt: 1 }
  });

  const rowCount = Math.ceil(question.tokens.length / 5);
  const contentHeight = rowCount === 1 ? 3.1 : Math.min(4.3, rowCount * 1.95);
  const y = 1.85 + (4.6 - contentHeight) / 2;
  drawTokenRow(slide, question.tokens.map((token) => toPptToken(token)), 1.25, y, 10.85, contentHeight, 5);
}

function addAnswerSummarySlide(pptx: any, questions: GameQuestion[]): void {
  const slide = createBaseSlide(pptx);
  slide.addText('總解答', {
    x: 0.75, y: 0.55, w: 3.2, h: 0.6,
    fontFace: 'Noto Sans TC',
    fontSize: 26,
    bold: true,
    color: TEXT_DARK,
    margin: 0
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 1.35, w: 11.83, h: 5.6,
    rectRadius: 0.08,
    fill: { color: CARD_BACKGROUND },
    line: { color: BORDER, pt: 1 }
  });

  const columns = questions.length > 12 ? 3 : questions.length > 6 ? 2 : 1;
  const rowsPerColumn = Math.ceil(questions.length / columns);
  const columnWidth = (11.83 - 0.9) / columns;
  const fontSize = questions.length > 12 ? 13 : 15;

  questions.forEach((question, index) => {
    const columnIndex = Math.floor(index / rowsPerColumn);
    const rowIndex = index % rowsPerColumn;
    const x = 1.05 + columnIndex * columnWidth;
    const y = 1.75 + rowIndex * 0.52;
    slide.addText(`第 ${index + 1} 題：${question.answers.join('、')}`, {
      x,
      y,
      w: columnWidth - 0.28,
      h: 0.3,
      fontFace: 'Noto Sans TC',
      fontSize,
      color: TEXT_DARK,
      margin: 0
    });
  });
}

function createBaseSlide(pptx: any): any {
  const slide = pptx.addSlide();
  slide.background = { color: SLIDE_BACKGROUND };
  return slide;
}

function drawTokenRow(
  slide: any,
  tokens: PptToken[],
  x: number,
  y: number,
  width: number,
  height: number,
  columns: number
): void {
  const rows = Math.max(1, Math.ceil(tokens.length / columns));
  const colGap = 0.1;
  const rowGap = 0.14;
  const tileWidth = (width - colGap * (columns - 1)) / columns;
  const tileHeight = (height - rowGap * (rows - 1)) / rows;
  const tileSize = Math.min(tileWidth, tileHeight);
  const totalRowWidth = columns * tileSize + (columns - 1) * colGap;
  const offsetX = x + Math.max(0, (width - totalRowWidth) / 2);

  tokens.forEach((token, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const tileX = offsetX + col * (tileSize + colGap);
    const tileY = y + row * (tileSize + rowGap);
    drawTokenTile(slide, token, tileX, tileY, tileSize, tileSize);
  });
}

function drawTokenTile(
  slide: any,
  token: PptToken,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const backgroundColor = token.backgroundColor ? toPptColor(token.backgroundColor) : null;
  const frameInset = Math.min(width, height) * 0.07;

  if (token.framed) {
    slide.addShape('roundRect', {
      x,
      y,
      w: width,
      h: height,
      rectRadius: 0.08,
      fill: { color: toPptColor(token.color) },
      line: { color: toPptColor(token.color), pt: 0, transparency: 100 }
    });

    slide.addShape('roundRect', {
      x: x + frameInset,
      y: y + frameInset,
      w: width - frameInset * 2,
      h: height - frameInset * 2,
      rectRadius: 0.06,
      fill: backgroundColor ? { color: backgroundColor } : { color: QUESTION_STAGE_BACKGROUND },
      line: backgroundColor
        ? { color: backgroundColor, pt: 0, transparency: 100 }
        : { color: QUESTION_STAGE_BACKGROUND, pt: 0, transparency: 100 }
    });
  } else if (backgroundColor) {
    slide.addShape('roundRect', {
      x,
      y,
      w: width,
      h: height,
      rectRadius: 0.08,
      fill: { color: backgroundColor },
      line: { color: backgroundColor, pt: 0, transparency: 100 }
    });
  }

  const fontSize = width < 1.4
    ? 48
    : width < 1.8
      ? 64
      : 84;

  slide.addText(token.text, {
    x,
    y,
    w: width,
    h: height,
    fontFace: 'Noto Sans TC',
    fontSize,
    bold: true,
    color: toPptColor(token.color),
    align: 'center',
    valign: 'middle',
    margin: [0.02, 0, 0, 0],
    fit: 'shrink'
  });
}

interface PptToken {
  text: string;
  color: string;
  colorName: string;
  backgroundColor: string | null;
  framed: boolean;
  answer: string;
}

function toPptToken(token: QuestionToken): PptToken {
  return {
    text: token.text,
    color: token.color.cssColor,
    colorName: token.color.name,
    backgroundColor: token.backgroundColor?.cssColor ?? null,
    framed: token.isFramed,
    answer: token.expectedAnswer
  };
}

function buildExampleTokens(options: ExportPptOptions): PptToken[] {
  const textA = options.config.textOptions[0] ?? '紅';
  const textB = options.config.textOptions[1] ?? options.config.textOptions[0] ?? '藍';
  const colorA = options.config.colorOptions.find((color) => color.name !== textA) ?? options.config.colorOptions[0];
  const colorB = options.config.colorOptions.find((color) => color.name !== textB && color.name !== colorA?.name) ?? options.config.colorOptions[0];
  const background = options.variant === 'advanced' && options.advancedBackgroundEnabled
    ? options.config.colorOptions.find((color) => color.name !== colorA.name)
    : null;

  return [
    {
      text: textA,
      color: colorA.cssColor,
      colorName: colorA.name,
      backgroundColor: background?.cssColor ?? null,
      framed: false,
      answer: colorA.name
    },
    {
      text: textB,
      color: colorB.cssColor,
      colorName: colorB.name,
      backgroundColor: background?.cssColor ?? null,
      framed: false,
      answer: colorB.name
    }
  ];
}

function buildAdvancedExampleTokens(options: ExportPptOptions): PptToken[] {
  const basic = buildExampleTokens(options);
  const secondBackground = options.variant === 'advanced' && options.advancedBackgroundEnabled
    ? options.config.colorOptions.find((color) => color.name !== basic[1].colorName)
    : null;

  return [
    basic[0],
    {
      ...basic[1],
      framed: true,
      backgroundColor: secondBackground?.cssColor ?? basic[1].backgroundColor,
      answer: basic[1].text
    }
  ];
}

function buildFileName(variant: GameVariant): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');

  return `stroop-color-game-${variant}-${stamp}.pptx`;
}

function toPptColor(color: string): string {
  return color.replace('#', '').toUpperCase();
}
