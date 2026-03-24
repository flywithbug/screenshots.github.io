(function (global) {
    function createCanvasRenderManager() {
        function drawBackgroundToContext(context, dims, bg) {
            if (bg.type === 'gradient') {
                const angle = bg.gradient.angle * Math.PI / 180;
                const x1 = dims.width / 2 - Math.cos(angle) * dims.width;
                const y1 = dims.height / 2 - Math.sin(angle) * dims.height;
                const x2 = dims.width / 2 + Math.cos(angle) * dims.width;
                const y2 = dims.height / 2 + Math.sin(angle) * dims.height;

                const gradient = context.createLinearGradient(x1, y1, x2, y2);
                bg.gradient.stops.forEach(stop => {
                    gradient.addColorStop(stop.position / 100, stop.color);
                });

                context.fillStyle = gradient;
                context.fillRect(0, 0, dims.width, dims.height);
            } else if (bg.type === 'solid') {
                context.fillStyle = bg.solid;
                context.fillRect(0, 0, dims.width, dims.height);
            } else if (bg.type === 'image' && bg.image) {
                const img = bg.image;
                let sx = 0, sy = 0, sw = img.width, sh = img.height;
                let dx = 0, dy = 0, dw = dims.width, dh = dims.height;

                if (bg.imageFit === 'cover') {
                    const imgRatio = img.width / img.height;
                    const canvasRatio = dims.width / dims.height;

                    if (imgRatio > canvasRatio) {
                        sw = img.height * canvasRatio;
                        sx = (img.width - sw) / 2;
                    } else {
                        sh = img.width / canvasRatio;
                        sy = (img.height - sh) / 2;
                    }
                } else if (bg.imageFit === 'contain') {
                    const imgRatio = img.width / img.height;
                    const canvasRatio = dims.width / dims.height;

                    if (imgRatio > canvasRatio) {
                        dh = dims.width / imgRatio;
                        dy = (dims.height - dh) / 2;
                    } else {
                        dw = dims.height * imgRatio;
                        dx = (dims.width - dw) / 2;
                    }

                    context.fillStyle = '#000';
                    context.fillRect(0, 0, dims.width, dims.height);
                }

                if (bg.imageBlur > 0) {
                    context.filter = `blur(${bg.imageBlur}px)`;
                }

                context.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
                context.filter = 'none';

                if (bg.overlayOpacity > 0) {
                    context.fillStyle = bg.overlayColor;
                    context.globalAlpha = bg.overlayOpacity / 100;
                    context.fillRect(0, 0, dims.width, dims.height);
                    context.globalAlpha = 1;
                }
            }
        }

        function drawNoiseToContext(context, dims, intensity) {
            const imageData = context.getImageData(0, 0, dims.width, dims.height);
            const data = imageData.data;
            const noiseAmount = intensity / 100;

            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * 255 * noiseAmount;
                data[i] = Math.max(0, Math.min(255, data[i] + noise));
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
            }

            context.putImageData(imageData, 0, 0);
        }

        function drawDeviceFrameToContext(context, x, y, width, height, settings) {
            const frameColor = settings.frame.color;
            const frameWidth = settings.frame.width * (width / 400);
            const frameOpacity = settings.frame.opacity / 100;
            const radius = (settings.cornerRadius || 0) * (width / 400) + frameWidth;

            context.globalAlpha = frameOpacity;
            context.strokeStyle = frameColor;
            context.lineWidth = frameWidth;
            context.beginPath();
            context.roundRect(x - frameWidth / 2, y - frameWidth / 2, width + frameWidth, height + frameWidth, radius);
            context.stroke();
            context.globalAlpha = 1;
        }

        function drawScreenshotToContext(context, dims, img, settings) {
            if (!img) return;

            const scale = settings.scale / 100;
            let imgWidth = dims.width * scale;
            let imgHeight = (img.height / img.width) * imgWidth;

            if (imgHeight > dims.height * scale) {
                imgHeight = dims.height * scale;
                imgWidth = (img.width / img.height) * imgHeight;
            }

            const moveX = Math.max(dims.width - imgWidth, dims.width * 0.15);
            const moveY = Math.max(dims.height - imgHeight, dims.height * 0.15);
            const x = (dims.width - imgWidth) / 2 + (settings.x / 100 - 0.5) * moveX;
            const y = (dims.height - imgHeight) / 2 + (settings.y / 100 - 0.5) * moveY;
            const centerX = x + imgWidth / 2;
            const centerY = y + imgHeight / 2;

            context.save();

            context.translate(centerX, centerY);

            if (settings.rotation !== 0) {
                context.rotate(settings.rotation * Math.PI / 180);
            }

            if (settings.perspective !== 0) {
                context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
            }

            context.translate(-centerX, -centerY);

            const radius = (settings.cornerRadius || 0) * (imgWidth / 400);

            if (settings.shadow && settings.shadow.enabled) {
                const shadowOpacity = settings.shadow.opacity / 100;
                const shadowColor = settings.shadow.color + Math.round(shadowOpacity * 255).toString(16).padStart(2, '0');
                context.shadowColor = shadowColor;
                context.shadowBlur = settings.shadow.blur;
                context.shadowOffsetX = settings.shadow.x;
                context.shadowOffsetY = settings.shadow.y;

                context.fillStyle = '#000';
                context.beginPath();
                context.roundRect(x, y, imgWidth, imgHeight, radius);
                context.fill();

                context.shadowColor = 'transparent';
                context.shadowBlur = 0;
                context.shadowOffsetX = 0;
                context.shadowOffsetY = 0;
            }

            context.beginPath();
            context.roundRect(x, y, imgWidth, imgHeight, radius);
            context.clip();
            context.drawImage(img, x, y, imgWidth, imgHeight);

            context.restore();

            if (settings.frame && settings.frame.enabled) {
                context.save();
                context.translate(centerX, centerY);
                if (settings.rotation !== 0) {
                    context.rotate(settings.rotation * Math.PI / 180);
                }
                if (settings.perspective !== 0) {
                    context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
                }
                context.translate(-centerX, -centerY);
                drawDeviceFrameToContext(context, x, y, imgWidth, imgHeight, settings);
                context.restore();
            }
        }

        return {
            drawBackgroundToContext,
            drawNoiseToContext,
            drawScreenshotToContext,
            drawDeviceFrameToContext
        };
    }

    global.createCanvasRenderManager = createCanvasRenderManager;
})(window);
