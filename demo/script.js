// Utils

function rgbToHex(r, g, b) {
  function componentToHex(c) {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }

  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");

  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return [r, g, b];
}

function isElementChildOfCanvas(canvas, element) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }

  let parent = element.parentNode;
  while (parent !== null) {
    if (parent === canvas) {
      return true;
    }
    parent = parent.parentNode;
  }

  return false;
}

function luminance([r, g, b]) {
  let a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(rgb1, rgb2) {
  let lum1 = luminance(rgb1);
  let lum2 = luminance(rgb2);
  let brightest = Math.max(lum1, lum2);
  let darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function generateContrastingColor(hex) {
  let originalColor = hexToRgb(hex);
  let newColor;

  for (let i = 0; i < 256; i++) {
    newColor = [i, i, i];
    if (contrast(originalColor, newColor) >= 3) {
      break;
    }
  }

  return newColor;
}

// Globals
window.Drawer = {};
window.Drawer.elements = [];
window.Drawer.events = {
  hasMouseMoveEvent: false,
};
window.Drawer.focusedElement = null;

// Graphic Class
class Graphic {
  constructor({
    tag = "div",
    context,
    canvas,
    id,
    ariaLabel = "",
    focable = false,
    pathColor = "#000",
    textContent,
    persistent = true,
  }) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Invalid <canvas> element.");
    }

    if (!id) {
      throw new Error("Element mush have an id.");
    }

    if (!context) {
      throw new Error("Context is required.");
    }

    this.id = id;
    this.children = [];
    this.ariaLabel = ariaLabel;
    this.element = false;
    this.context = context;
    this.canvas = canvas;
    this.pathColor = hexToRgb(pathColor);
    this.onClickCallback = () => {};
    this.onFocusCallback = () => {};
    this.path = new Path2D();
    this.tag = tag;
    this.autoSemantic = true;
    this.focable = focable;
    this.textContent = textContent;
    this.persistent = persistent;

    const _element = window.Drawer.elements.find(
      (element) => element.id === this.id
    );

    if (persistent && !_element) {
      window.Drawer.elements.push({
        id: id,
        inSubDOM: false,
        path: this.path,
        clickable: this.tag === "button",
        onClick: null,
      });

      this.setCanvasMouseEvents();
      this.initializeDraw();
    }

    if (!this.persistent) {
      Array.from(this.canvas.children).forEach((child) => {
        console.log(child.getAttribute("drawer-id"));
        if (child.getAttribute("drawer-id") === this.id) {
          this.canvas.removeChild(child);
        }
      });
    }
  }

  onClickCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const clickableElements = window.Drawer.elements.filter(
      (element) => element.clickable
    );

    let clicked = false;

    // apenas o ultimo elemento deve clicado em caso de overlapping
    clickableElements.reverse().forEach(({ path, onClick }) => {
      if (!clicked && this.context.isPointInPath(path, mouseX, mouseY)) {
        onClick();
        clicked = true;
      }
    });

    // evitar repetir o evento para os outros elementos
    event.stopImmediatePropagation();
  }

  setCanvasMouseEvents() {
    if (!window.Drawer.events.hasMouseMoveEvent) {
      this.canvas.addEventListener(
        "mousemove",
        function (event) {
          const rect = canvas.getBoundingClientRect();
          const mouseX = event.clientX - rect.left;
          const mouseY = event.clientY - rect.top;

          let outsideAllButtons = true;

          const clickableElements = window.Drawer.elements.filter(
            (element) => element.clickable
          );

          clickableElements.forEach(({ path }) => {
            if (this.context.isPointInPath(path, mouseX, mouseY)) {
              outsideAllButtons = false;
              canvas.style.cursor = "pointer";
            }
          });

          if (outsideAllButtons) canvas.style.cursor = "auto";
        }.bind(this)
      );

      this.x = this.onClickCanvas.bind(this);
      this.canvas.removeEventListener("click", this.x);

      this.canvas.addEventListener("click", this.x);
    }
  }

  initializeDraw() {
    this.context.beginPath();
  }

  /**
   * Cria o elemento da subDOM automaticamente
   */
  autoSubDOM(text = null) {
    const _element = window.Drawer.elements.find(
      (element) => element.id === this.id
    );

    if (this.persistent && _element.inSubDOM) return;

    const element = document.createElement(this.tag);
    element.setAttribute("drawer-id", this.id);
    element.setAttribute("tabIndex", 0);

    if (this.tag === "button") {
      element.setAttribute("type", "button");
    }

    if (text) element.textContent = text;

    if (this.ariaLabel) {
      element.setAttribute("alt", this.ariaLabel);
      if (!this.textContent) element.textContent = this.ariaLabel;
    }

    // TODO: check this!
    // button.textContent = this.ariaLabel;

    canvas.appendChild(element);
    if (this.persistent) _element.inSubDOM = true;
    this.element = element;
  }

  addChild(graphic) {
    this.children.push(graphic);

    if (graphic.element) {
      this.element.appendChild(graphic.element);
      graphic.onClick(this.onClickCallback);
      graphic.onFocus(this.onFocusCallback);
    }
  }

  restoreElement() {}

  elementAlreadyHaveOnClick() {
    const _element = window.Drawer.elements.find(
      (element) => element.id === this.id
    );
    return _element.hasOnClick;
  }

  setHaveOnClick(onClick = true) {
    const _element = window.Drawer.elements.find(
      (element) => element.id === this.id
    );
    _element.hasOnClick = onClick;
  }

  setOnClick(onClick) {
    if (this.persistent) {
      const _element = window.Drawer.elements.find(
        (element) => element.id === this.id
      );
      _element.onClick = onClick;
    } else {
      this.element.onClick = onClick;
    }
  }

  setPath() {
    if (this.persistent) {
      const _element = window.Drawer.elements.find(
        (element) => element.id === this.id
      );
      _element.path = this.path;
    }
  }

  /**
   * Associa o path do canvas a um elemento da subDOM.
   *
   * @param {HTMLElement} element
   * @returns
   */
  setElementPath(element) {
    if (!isElementChildOfCanvas(this.canvas, element)) {
      throw "Element must be a child of the canvas!";
    }

    const _element = window.Drawer.elements.find(
      (element) => element.id === this.id
    );
    this.element = element;

    if (_element.inSubDOM) return;

    element.setAttribute("drawer-id", this.id);
    element.setAttribute("alt", this.ariaLabel);

    this.autoSemantic = false;
    if (_element) _element.inSubDOM = true;
  }

  addTextContent({
    content,
    x,
    y,
    color = "#FFF",
    textAlign = "left",
    textBaseline = "middle",
  }) {
    if (!content) {
      throw "Text content is required!";
    }

    if (x === undefined || y === undefined) {
      throw "X and Y ar required for text content!";
    }

    this.context.fillStyle = color;
    this.context.textAlign = textAlign;
    this.context.textBaseline = textBaseline;

    ctx.fillText(content, x, y);
    if (this.element) this.element.textContent = content;
  }

  /**
   * Desenha o path no canvas
   *
   * @param {boolean} autoSemantic - se true, um elemento semântico será criado de acordo com o parâmetro passado
   * para classe Polygon
   *
   * @returns
   */
  draw(undoFocusRing = false) {
    if (!undoFocusRing) {
      this.path.closePath();
    }

    this.setPath();

    // TODO: autosemantic
    if (this.autoSemantic) {
      if (!this.persistent && undoFocusRing) {
        // do nothing
      } else {
        this.autoSubDOM();
      }
    }

    // coloring the path
    var width = this.canvas.width;
    var height = this.canvas.height;
    var existingImageData = this.context.getImageData(0, 0, width, height);
    var existingData = existingImageData.data;

    var imageData = this.context.createImageData(width, height);
    var data = imageData.data;

    for (var i = 0; i < existingData.length; i++) {
      data[i] = existingData[i];
    }

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var index = (y * width + x) * 4;
        if (this.context.isPointInPath(this.path, x, y)) {
          data[index] = this.pathColor[0];
          data[index + 1] = this.pathColor[1];
          data[index + 2] = this.pathColor[2];
          data[index + 3] = 255;
        }
      }
    }

    this.context.putImageData(imageData, 0, 0);

    if (this.textContent && Object.keys(this.textContent).length > 0) {
      this.addTextContent(this.textContent);
    }
  }

  /**
   * O evento de click é associado tanto ao elemento semântico quanto ao path
   *
   * @param {Function} callback
   */
  onClick(callback) {
    this.onClickCallback = callback;

    if (this.element) {
      this.element.onclick = () => {
        this.element.focus();
        this.onClickCallback();
      };
    }

    // if (this.elementAlreadyHaveOnClick()) return;

    this.setOnClick(callback);

    // this.canvas.addEventListener(
    //   "click",
    //   function (event) {
    //     const rect = canvas.getBoundingClientRect();
    //     const mouseX = event.clientX - rect.left;
    //     const mouseY = event.clientY - rect.top;

    //     if (this.context.isPointInPath(this.path, mouseX, mouseY)) {
    //       callback();
    //     }
    //   }.bind(this)
    // );
  }

  /**
   * O evento de foco é associado ao elemento semântico. Quando focado, é desenhado um anel de foco em torno do path
   *
   * @param {Function} callback
   */
  onFocus(callback) {
    if (!this.focable || !this.element) return;

    this.onFocusCallback = callback;

    this.element.onfocus = this.handleFocus.bind(this);

    this.onBlur();
  }

  handleFocus() {
    this.drawFocusRing();
    this.onFocusCallback();
  }

  drawFocusRing() {
    const imgData = this.context.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const data = imgData.data;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const path = this.path;
        if (this.context.isPointInPath(path, x, y)) {
          const positions = [
            { x: x - 1, y: y, type: "left" },
            { x: x + 1, y: y, type: "right" },

            { x: x, y: y - 1, type: "top" },
            { x: x, y: y + 1, type: "bottom" },

            { x: x - 1, y: y - 1, type: "left-top" },
            { x: x + 1, y: y - 1, type: "right-top" },
            { x: x - 1, y: y + 1, type: "left-bottom" },
            { x: x + 1, y: y + 1, type: "right-bottoms" },
          ];

          positions.forEach((vizi) => {
            if (!this.context.isPointInPath(path, vizi.x, vizi.y)) {
              let index = (y * this.canvas.width + x) * 4;
              data[index] = 0;
              data[index + 1] = 0;
              data[index + 2] = 0;
              data[index + 3] = 255;

              if (vizi.type === "top") {
                if (this.context.isPointInPath(path, x, y + 1)) {
                  index = ((y + 1) * this.canvas.width + x) * 4;
                  data[index] = 0;
                  data[index + 1] = 0;
                  data[index + 2] = 0;
                  data[index + 3] = 255;
                }
              } else if (vizi.type === "left") {
                if (this.context.isPointInPath(path, x + 1, y)) {
                  index = (y * this.canvas.width + (x + 1)) * 4;
                  data[index] = 0;
                  data[index + 1] = 0;
                  data[index + 2] = 0;
                  data[index + 3] = 255;
                }
              } else if (vizi.type === "right") {
                if (this.context.isPointInPath(path, x - 1, y)) {
                  index = (y * this.canvas.width + (x - 1)) * 4;
                  data[index] = 0;
                  data[index + 1] = 0;
                  data[index + 2] = 0;
                  data[index + 3] = 255;
                }
              } else if (vizi.type === "bottom") {
                if (this.context.isPointInPath(path, x, y - 1)) {
                  index = ((y - 1) * this.canvas.width + x) * 4;
                  data[index] = 0;
                  data[index + 1] = 0;
                  data[index + 2] = 0;
                  data[index + 3] = 255;
                }
              }
            }
          });
        }
      }
    }
    this.context.putImageData(imgData, 0, 0);
  }

  onBlur() {
    if (!this.focable || !this.element) return;
    this.element.onblur = () => {
      this.draw(true);
    };
  }
}

class GraphicText extends Graphic {
  constructor({ content, color, x, y, align, ...props }) {
    super(props);
    this.content = content;
    this.x = x;
    this.y = y;
    this.align = align;
    this.color = color;
  }

  draw(newColor = null) {
    this.context.fillStyle = newColor ?? this.color;
    this.context.textAlign = this.align;
    this.context.fillText(this.content, this.x, this.y);

    if (this.autoSemantic) this.autoSubDOM(this.content);
  }

  onFocus(callback) {
    if (!this.focable || !this.element) return;

    this.onFocusCallback = callback;

    this.element.onfocus = this.handleFocus.bind(this);

    this.onBlur();
  }

  handleFocus() {
    this.focusText();
    this.onFocusCallback();
  }

  focusText() {
    const rgbColor = generateContrastingColor(this.color);
    const newColor = rgbToHex(rgbColor[0], rgbColor[1], rgbColor[2]);
    this.draw("#FF0000");
  }

  onBlur() {
    if (!this.focable || !this.element) return;
    this.element.onblur = () => {
      this.draw();
    };
  }
}

////////////////////////////////////////

const canvas = document.getElementById("chartCanvas");
const ctx = canvas.getContext("2d");

const chartWidth = canvas.width - 100;
const chartHeight = canvas.height - 100;
const barWidth = 50;
const barSpacing = 70;
const datasets = [
  [12, 45, 30, 11, 50, 78], // Dataset 1
  [80, 30, 20, 50, 10, 13], // Dataset 2
];
const labels = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho"];

let currentDataset = 0;

function drawChart() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const maxValue = Math.max(...datasets.flat()) + 10; // Adding some margin
  const scaleFactor = (chartHeight - 20) / maxValue;

  // Desenho dos eixos
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Eixo x
  ctx.moveTo(50, canvas.height - 50);
  ctx.lineTo(canvas.width - 50, canvas.height - 50);
  // Eixo y
  ctx.moveTo(50, canvas.height - 50);
  ctx.lineTo(50, 50);
  ctx.stroke();

  datasets[currentDataset].forEach((value, index) => {
    const bar = new Graphic({
      tag: "button",
      context: ctx,
      canvas,
      id: `bar-${index}`,
      ariaLabel: `Barra ${index}`,
      focable: true,
      pathColor: "#4CAF50",
      persistent: false,
    });

    const x = 50 + index * barSpacing;
    const y = canvas.height - 50 - value * scaleFactor;

    const path = bar.path;
    path.rect(x, y, barWidth, canvas.height - 50 - y);

    bar.draw();
    bar.onFocus(() => {
      console.log("focado");
    });
    bar.onClick(() => {
      console.log("clicou");
    });
  });

  // Desenho das labels
  ctx.fillStyle = "#000";
  labels.forEach((label, index) => {
    const x =
      50 + index * barSpacing + barWidth / 2 - ctx.measureText(label).width / 2;
    ctx.fillText(label, x, canvas.height - 20);
  });

  // Desenho das labels do eixo y
  ctx.textAlign = "right";
  for (let i = 0; i <= maxValue; i += 10) {
    const y = canvas.height - 50 - i * scaleFactor; // Apply scale factor
    ctx.fillText(i, 45, y + 5);
  }

  // Desenho dos botões
  drawButton(50, 10, "Anterior").onClick(() => {
    changeDataset(-1);
  });
  drawButton(150, 10, "Próximo").onClick(() => {
    changeDataset(1);
  });
}

function drawButton(x, y, text) {
  const textContent = {
    textAlign: "center",
    content: text,
    x: x + 40,
    y: y + 15,
  };

  const button = new Graphic({
    tag: "button",
    context: ctx,
    canvas: canvas,
    id: `button=${text}`,
    focable: true,
    pathColor: "#2196F3",
    textContent,
  });

  const path = button.path;

  path.rect(x, y, 80, 30);

  button.draw();

  button.onFocus(() => {});

  return button;
}

function isButtonClicked(x, y, mouseX, mouseY) {
  return mouseX >= x && mouseX <= x + 80 && mouseY >= y && mouseY <= y + 30;
}

function changeDataset(direction) {
  currentDataset =
    (currentDataset + direction + datasets.length) % datasets.length;
  drawChart();
}
drawChart();