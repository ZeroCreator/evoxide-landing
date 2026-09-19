(() => {
    // Dynamic year
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Header background on scroll
    const header = document.querySelector('.header');
    const toggleHeader = () => {
        if (window.scrollY > 40) {
            header.classList.add('header--scrolled');
        } else {
            header.classList.remove('header--scrolled');
        }
    };
    window.addEventListener('scroll', toggleHeader, { passive: true });
    toggleHeader();

    // Mobile menu
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav');
    const navLinks = document.querySelectorAll('.nav__link');

    burger.addEventListener('click', () => {
        nav.classList.toggle('nav--open');
        burger.classList.toggle('burger--open');
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('nav--open');
            burger.classList.remove('burger--open');
        });
    });

    // Premium logo tilt: the mark responds to the cursor without affecting the layout.
    const heroMark = document.querySelector('[data-mark-motion]');
    const heroMarkInteraction = heroMark?.querySelector('.hero__mark-interaction');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (heroMark && heroMarkInteraction && finePointer && !reducedMotion) {
        let tiltFrame = 0;

        const resetHeroMark = () => {
            heroMarkInteraction.style.transform = 'perspective(820px) rotateX(0deg) rotateY(0deg) translateZ(0)';
        };

        heroMark.addEventListener('pointermove', event => {
            const bounds = heroMark.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;

            cancelAnimationFrame(tiltFrame);
            tiltFrame = requestAnimationFrame(() => {
                heroMarkInteraction.style.transform = `perspective(820px) rotateX(${-y * 15}deg) rotateY(${x * 19}deg) translateZ(14px)`;
            });
        });

        heroMark.addEventListener('pointerleave', () => {
            cancelAnimationFrame(tiltFrame);
            resetHeroMark();
        });
    }

    // The hero mark is intentionally kept as a reliable flat SVG. Its geometry
    // must stay identical to the source logo on every browser.
    const heroMarkWebgl = heroMark?.querySelector('.hero__mark-webgl');
    const heroMarkFallback = heroMark?.querySelector('.hero__mark-fallback');
    let heroMarkRevealProgress = 0;
    let renderHeroMarkFrame = null;
    let heroMarkRevealStarted = false;
    let heroMarkFallbackReady = !heroMarkWebgl;

    const showHeroMarkFallback = () => {
        heroMarkFallbackReady = true;
        if (!heroMarkRevealStarted) return;
        heroMarkFallback?.classList.add('hero__mark-fallback--visible');
        heroMarkFallback?.classList.remove('hero__mark-fallback--hidden');
    };

    const hideHeroMarkFallback = () => {
        heroMarkFallback?.classList.remove('hero__mark-fallback--visible');
        heroMarkFallback?.classList.add('hero__mark-fallback--hidden');
    };

    const setupHeroMarkWebgl = () => {
        if (!heroMarkWebgl || heroMarkWebgl.dataset.webglReady === 'true') return;

        try {
            const gl = heroMarkWebgl.getContext('webgl', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false
            });

            if (!gl) {
                showHeroMarkFallback();
                return;
            }

            const vertexShaderSource = `
                attribute vec3 a_position;
                attribute vec3 a_normal;
                attribute vec3 a_color;
                uniform mat4 u_model;
                uniform mat4 u_view_projection;
                varying vec3 v_normal;
                varying vec3 v_color;
                varying vec3 v_world_position;

                void main() {
                    vec4 worldPosition = u_model * vec4(a_position, 1.0);
                    v_world_position = worldPosition.xyz;
                    v_normal = mat3(u_model) * a_normal;
                    v_color = a_color;
                    gl_Position = u_view_projection * worldPosition;
                }
            `;
            const fragmentShaderSource = `
                precision mediump float;
                uniform float u_reveal;
                varying vec3 v_normal;
                varying vec3 v_color;
                varying vec3 v_world_position;

                void main() {
                    vec4 base = vec4(v_color, 1.0);

                    if (base.a < 0.04) discard;

                    vec3 normal = normalize(v_normal);
                    vec3 lightDirection = normalize(vec3(-0.42, 0.62, 0.92));
                    vec3 viewDirection = normalize(vec3(0.0, 0.0, 9.0) - v_world_position);
                    vec3 halfDirection = normalize(lightDirection + viewDirection);
                    float diffuse = 0.38 + 0.62 * max(dot(normal, lightDirection), 0.0);
                    float specular = pow(max(dot(normal, halfDirection), 0.0), 34.0) * 0.3;
                    float nightToLight = 0.22 + u_reveal * 0.78;
                    vec3 litColor = (base.rgb * (0.64 + diffuse * 0.42) + vec3(specular)) * nightToLight;

                    gl_FragColor = vec4(litColor, base.a * u_reveal);
                }
            `;

            const compileShader = (type, source) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader compilation failed');
                }
                return shader;
            };

            const program = gl.createProgram();
            gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
            gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || 'WebGL program linking failed');
            }

            const attrib = name => gl.getAttribLocation(program, name);
            const uniform = name => gl.getUniformLocation(program, name);
            const locations = {
                position: attrib('a_position'),
                normal: attrib('a_normal'),
                color: attrib('a_color'),
                model: uniform('u_model'),
                viewProjection: uniform('u_view_projection'),
                reveal: uniform('u_reveal')
            };

            const positions = [];
            const normals = [];
            const colors = [];
            const depth = 0.46;

            // This is the original EVOxide mark. Only its particle decorations are
            // removed; the separate canvas below renders the ignition animation.
            const sourceOutline = [
                [229, 0], [435, 119], [435, 192], [237, 312], [219, 312],
                [177, 295], [178, 279], [379, 159], [379, 155], [372, 150],
                [229, 68], [57, 170], [57, 362], [228, 463], [231, 468],
                [235, 462], [362, 389], [363, 382], [416, 382], [414, 426],
                [238, 529], [0, 396], [0, 137]
            ];
            // The oxide strip is deliberately a clean trapezoid. The small stepped
            // fragments from the full logo belong to the particle field, not to the
            // 3D face itself.
            const sourceAccent = [
                [231, 468], [416, 382], [414, 426], [238, 529], [231, 524]
            ];
            const modelScale = 0.0094;
            const toModelPoint = point => [
                (point[0] - 249.5) * modelScale,
                (264.5 - point[1]) * modelScale
            ];
            const outline = sourceOutline.map(toModelPoint);
            const accent = sourceAccent.map(toModelPoint);
            const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
            const cross2d = (a, b) => a[0] * b[1] - a[1] * b[0];
            const polygonArea = polygon => polygon.reduce((area, point, index) => {
                const next = polygon[(index + 1) % polygon.length];
                return area + point[0] * next[1] - next[0] * point[1];
            }, 0) / 2;
            const pointInTriangle = (point, a, b, c) => {
                const ab = cross2d(subtract(b, a), subtract(point, a));
                const bc = cross2d(subtract(c, b), subtract(point, b));
                const ca = cross2d(subtract(a, c), subtract(point, c));
                const hasNegative = ab < -0.000001 || bc < -0.000001 || ca < -0.000001;
                const hasPositive = ab > 0.000001 || bc > 0.000001 || ca > 0.000001;
                return !(hasNegative && hasPositive);
            };
            const triangulate = polygon => {
                const indices = Array.from({ length: polygon.length }, (_, index) => index);
                if (polygonArea(polygon) < 0) indices.reverse();
                const triangles = [];
                let guard = 0;

                while (indices.length > 3 && guard < polygon.length * polygon.length) {
                    let clipped = false;
                    guard += 1;

                    for (let index = 0; index < indices.length; index += 1) {
                        const previousIndex = indices[(index - 1 + indices.length) % indices.length];
                        const currentIndex = indices[index];
                        const nextIndex = indices[(index + 1) % indices.length];
                        const previous = polygon[previousIndex];
                        const current = polygon[currentIndex];
                        const next = polygon[nextIndex];

                        if (cross2d(subtract(current, previous), subtract(next, current)) <= 0.000001) continue;

                        const containsPoint = indices.some(candidateIndex => {
                            if (candidateIndex === previousIndex || candidateIndex === currentIndex || candidateIndex === nextIndex) return false;
                            return pointInTriangle(polygon[candidateIndex], previous, current, next);
                        });

                        if (containsPoint) continue;
                        triangles.push([previousIndex, currentIndex, nextIndex]);
                        indices.splice(index, 1);
                        clipped = true;
                        break;
                    }

                    if (!clipped) break;
                }

                if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
                return triangles;
            };

            const addVertex = (point, z, normal, color) => {
                positions.push(point[0], point[1], z);
                normals.push(normal[0], normal[1], normal[2]);
                colors.push(color[0], color[1], color[2]);
            };

            const addTriangle = (a, b, c, z, normal, color) => {
                addVertex(a, z[0], normal, color);
                addVertex(b, z[1], normal, color);
                addVertex(c, z[2], normal, color);
            };

            const addQuad = (a, b, c, d, z, normal, color) => {
                addTriangle(a, b, c, [z[0], z[1], z[2]], normal, color);
                addTriangle(a, c, d, [z[0], z[2], z[3]], normal, color);
            };

            const whiteColor = [1, 1, 1];
            const brickColor = [0.7686, 0.2706, 0.0549];
            const backColor = [0.68, 0.33, 0.2];
            // #f0a078 — the same light warm orange used by “Инженерная команда”.
            const sideColor = [0.941176, 0.627451, 0.470588];

            const addPolygonFace = (polygon, color, z, normal, reverse = false) => {
                triangulate(polygon).forEach(([a, b, c]) => {
                    const triangle = reverse ? [c, b, a] : [a, b, c];
                    addTriangle(
                        polygon[triangle[0]],
                        polygon[triangle[1]],
                        polygon[triangle[2]],
                        [z, z, z],
                        normal,
                        color
                    );
                });
            };

            addPolygonFace(outline, whiteColor, depth, [0, 0, 1]);
            addPolygonFace(outline, backColor, -depth, [0, 0, -1], true);
            // Keep the colour seam on the same face while avoiding depth-buffer
            // flicker at the shared boundary. The offset is less than one pixel.
            addPolygonFace(accent, brickColor, depth + 0.0015, [0, 0, 1]);

            const outlineWinding = polygonArea(outline) >= 0 ? 1 : -1;
            outline.forEach((start, index) => {
                const end = outline[(index + 1) % outline.length];
                const direction = subtract(end, start);
                const length = Math.hypot(direction[0], direction[1]) || 1;
                const normal = outlineWinding > 0
                    ? [direction[1] / length, -direction[0] / length, 0]
                    : [-direction[1] / length, direction[0] / length, 0];
                addQuad(start, end, end, start, [depth, depth, -depth, -depth], normal, sideColor);
            });

            const createBuffer = (data, size) => {
                const buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
                gl.enableVertexAttribArray(size.location);
                gl.vertexAttribPointer(size.location, size.components, gl.FLOAT, false, 0, 0);
            };

            gl.useProgram(program);
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(locations.position);
            gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
            createBuffer(normals, { location: locations.normal, components: 3 });
            createBuffer(colors, { location: locations.color, components: 3 });

            const perspective = (fov, aspect, near, far) => {
                const f = 1 / Math.tan(fov / 2);
                const range = 1 / (near - far);
                return new Float32Array([
                    f / aspect, 0, 0, 0,
                    0, f, 0, 0,
                    0, 0, (far + near) * range, -1,
                    0, 0, 2 * far * near * range, 0
                ]);
            };

            const lookAt = (eye, target, up) => {
                const normalize = vector => {
                    const length = Math.hypot(...vector) || 1;
                    return vector.map(value => value / length);
                };
                const subtract = (a, b) => a.map((value, index) => value - b[index]);
                const crossProduct = (a, b) => [
                    a[1] * b[2] - a[2] * b[1],
                    a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0]
                ];
                const z = normalize(subtract(eye, target));
                const x = normalize(crossProduct(up, z));
                const y = crossProduct(z, x);
                return new Float32Array([
                    x[0], y[0], z[0], 0,
                    x[1], y[1], z[1], 0,
                    x[2], y[2], z[2], 0,
                    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
                    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
                    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2], 1
                ]);
            };

            const multiplyMatrices = (a, b) => {
                const result = new Float32Array(16);
                for (let column = 0; column < 4; column += 1) {
                    for (let row = 0; row < 4; row += 1) {
                        result[column * 4 + row] =
                            a[row] * b[column * 4] +
                            a[4 + row] * b[column * 4 + 1] +
                            a[8 + row] * b[column * 4 + 2] +
                            a[12 + row] * b[column * 4 + 3];
                    }
                }
                return result;
            };

            const rotationX = angle => {
                const cosine = Math.cos(angle);
                const sine = Math.sin(angle);
                return new Float32Array([1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1]);
            };
            const rotationY = angle => {
                const cosine = Math.cos(angle);
                const sine = Math.sin(angle);
                return new Float32Array([cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1]);
            };
            const rotationZ = angle => {
                const cosine = Math.cos(angle);
                const sine = Math.sin(angle);
                return new Float32Array([cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            };
            const scaling = amount => new Float32Array([
                amount, 0, 0, 0,
                0, amount, 0, 0,
                0, 0, amount, 0,
                0, 0, 0, 1
            ]);
            const translation = (x, y, z) => new Float32Array([
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1
            ]);

            const resizeWebgl = () => {
                const bounds = heroMarkWebgl.getBoundingClientRect();
                const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
                heroMarkWebgl.width = Math.max(1, Math.round(bounds.width * pixelRatio));
                heroMarkWebgl.height = Math.max(1, Math.round(bounds.height * pixelRatio));
                gl.viewport(0, 0, heroMarkWebgl.width, heroMarkWebgl.height);
            };

            const view = lookAt([0, 0.08, 9.4], [0, 0, 0], [0, 1, 0]);
            let renderedFrames = 0;

            const renderWebgl = timestamp => {
                const elapsed = timestamp * 0.001;
                const bounds = heroMarkWebgl.getBoundingClientRect();
                const aspect = Math.max(bounds.width, 1) / Math.max(bounds.height, 1);
                const projection = perspective((30 * Math.PI) / 180, aspect, 0.1, 100);
                const viewProjection = multiplyMatrices(projection, view);
                const reveal = heroMarkRevealProgress * heroMarkRevealProgress * (3 - 2 * heroMarkRevealProgress);
                const depthReveal = (1 - reveal) * 1.35;
                const revealScale = 0.88 + reveal * 0.12;
                const rotation = multiplyMatrices(
                    rotationZ(!reducedMotion ? Math.sin(elapsed * 0.46) * 0.012 : 0),
                    multiplyMatrices(
                        rotationY(!reducedMotion ? -0.16 + Math.sin(elapsed * 0.58) * 0.13 : -0.16),
                        rotationX(!reducedMotion ? -0.06 + Math.sin(elapsed * 0.72) * 0.055 : -0.06)
                    )
                );
                const model = multiplyMatrices(
                    translation(0, !reducedMotion ? Math.sin(elapsed * 0.86) * 0.045 : 0, -depthReveal),
                    multiplyMatrices(scaling(revealScale), rotation)
                );

                gl.viewport(0, 0, heroMarkWebgl.width, heroMarkWebgl.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LESS);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.useProgram(program);
                gl.uniformMatrix4fv(locations.model, false, model);
                gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
                gl.uniform1f(locations.reveal, reveal);
                gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);

                renderedFrames += 1;
                if (renderedFrames > 1) hideHeroMarkFallback();
            };

            heroMarkWebgl.addEventListener('webglcontextlost', showHeroMarkFallback, { passive: true });
            resizeWebgl();
            window.addEventListener('resize', resizeWebgl, { passive: true });
            heroMarkWebgl.dataset.webglReady = 'true';
            renderHeroMarkFrame = renderWebgl;
            const renderLoop = timestamp => {
                renderWebgl(timestamp);
                window.requestAnimationFrame(renderLoop);
            };
            window.requestAnimationFrame(renderLoop);
        } catch (error) {
            heroMark.dataset.webglError = error.message;
            console.warn('3D logo fallback:', error);
            showHeroMarkFallback();
        }
    };

    if (heroMarkWebgl) window.setTimeout(setupHeroMarkWebgl, 0);

    const beginHeroMarkReveal = () => {
        const startedAt = Date.now();
        const updateReveal = () => {
            heroMarkRevealProgress = Math.min(1, Math.max(0, (Date.now() - startedAt) / 4_200));
            if (heroMarkFallbackReady) {
                heroMarkFallback.style.opacity = `${heroMarkRevealProgress}`;
            }
            renderHeroMarkFrame?.(window.performance.now());
            if (heroMarkRevealProgress < 1) window.setTimeout(updateReveal, 50);
        };
        heroMarkRevealStarted = true;
        if (heroMarkFallbackReady) showHeroMarkFallback();
        updateReveal();
    };

    // The visible ignition layer: sparks, trails and a heat wave originate from the oxide.
    const heroMarkCanvas = heroMark?.querySelector('.hero__mark-canvas');
    const heroMarkContext = heroMarkCanvas?.getContext('2d');

    if (heroMarkCanvas && heroMarkContext && !reducedMotion) {
        const particles = [];
        const waves = [];
        const origin = { x: 0, y: 0 };
        let canvasWidth = 0;
        let canvasHeight = 0;
        let deviceScale = 1;
        let lastFrame = 0;
        let nextBurst = 0;
        const heroMarkEdgeAngle = -Math.atan2(106, 175);

        const randomBetween = (min, max) => min + Math.random() * (max - min);

        const resizeHeroMarkCanvas = () => {
            const bounds = heroMarkCanvas.getBoundingClientRect();
            deviceScale = Math.min(window.devicePixelRatio || 1, 2);
            canvasWidth = bounds.width;
            canvasHeight = bounds.height;
            heroMarkCanvas.width = Math.max(1, Math.round(canvasWidth * deviceScale));
            heroMarkCanvas.height = Math.max(1, Math.round(canvasHeight * deviceScale));
            heroMarkContext.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

            // The canvas is intentionally larger than the mark, so the sparks can leave its silhouette.
            // Match the centre of the short orange edge, not the inner gap.
            origin.x = canvasWidth * 0.588;
            origin.y = canvasHeight * 0.696;
        };

        const emitHeroMarkBurst = () => {
            heroMark?.classList.add('hero__mark--flash');
            window.setTimeout(() => heroMark?.classList.remove('hero__mark--flash'), 360);

            waves.push({
                age: 0,
                life: 1.12,
                radius: Math.min(canvasWidth, canvasHeight) * randomBetween(0.08, 0.12)
            });

            for (let index = 0; index < 14; index += 1) {
                particles.push({
                    age: 0,
                    life: randomBetween(0.82, 1.7),
                    x: origin.x + randomBetween(-5, 6),
                    y: origin.y + randomBetween(-5, 5),
                    trajectory: heroMarkEdgeAngle + randomBetween(-0.03, 0.03),
                    speed: randomBetween(48, 104),
                    gravity: randomBetween(0, 5),
                    drag: randomBetween(0.04, 0.12),
                    size: randomBetween(2.2, 6.4),
                    angle: randomBetween(0, Math.PI * 2),
                    spin: randomBetween(-5, 5),
                    hue: randomBetween(16, 28)
                });

                const ember = particles[particles.length - 1];
                ember.vx = Math.cos(ember.trajectory) * ember.speed;
                ember.vy = Math.sin(ember.trajectory) * ember.speed;
            }
        };

        const drawHeroMarkCanvas = timestamp => {
            if (!lastFrame) lastFrame = timestamp;
            const delta = Math.min((timestamp - lastFrame) / 1000, 0.035);
            lastFrame = timestamp;
            nextBurst -= delta * 1000;

            if (nextBurst <= 0) {
                emitHeroMarkBurst();
                nextBurst = randomBetween(920, 1450);
            }

            heroMarkContext.clearRect(0, 0, canvasWidth, canvasHeight);
            heroMarkContext.save();
            heroMarkContext.globalCompositeOperation = 'lighter';

            const pulse = 0.5 + Math.sin(timestamp / 260) * 0.5;
            const coreRadius = 5 + pulse * 6;
            const coreGlow = heroMarkContext.createRadialGradient(
                origin.x,
                origin.y,
                0,
                origin.x,
                origin.y,
                coreRadius * 2.8
            );
            coreGlow.addColorStop(0, `rgba(255, 224, 207, ${0.72 + pulse * 0.18})`);
            coreGlow.addColorStop(0.22, `rgba(255, 142, 83, ${0.36 + pulse * 0.2})`);
            coreGlow.addColorStop(1, 'rgba(196, 69, 14, 0)');
            heroMarkContext.fillStyle = coreGlow;
            heroMarkContext.beginPath();
            heroMarkContext.arc(origin.x, origin.y, coreRadius * 2.8, 0, Math.PI * 2);
            heroMarkContext.fill();

            const ribbonPulse = 0.28 + (Math.sin(timestamp / 340) + 1) * 0.18;
            heroMarkContext.setLineDash([18, 34]);
            heroMarkContext.lineDashOffset = -timestamp * 0.055;
            heroMarkContext.lineCap = 'round';
            for (let index = 0; index < 3; index += 1) {
                const startOffset = index * 2;
                const ribbonLength = 92 + index * 18;
                heroMarkContext.globalAlpha = ribbonPulse - index * 0.045;
                heroMarkContext.strokeStyle = index === 0 ? 'rgba(255, 195, 159, 0.88)' : 'rgba(213, 83, 25, 0.7)';
                heroMarkContext.lineWidth = 1.2 + index * 0.45;
                heroMarkContext.beginPath();
                heroMarkContext.moveTo(
                    origin.x + Math.cos(heroMarkEdgeAngle) * startOffset,
                    origin.y + Math.sin(heroMarkEdgeAngle) * startOffset
                );
                heroMarkContext.lineTo(
                    origin.x + Math.cos(heroMarkEdgeAngle) * ribbonLength,
                    origin.y + Math.sin(heroMarkEdgeAngle) * ribbonLength
                );
                heroMarkContext.stroke();
            }
            heroMarkContext.setLineDash([]);
            heroMarkContext.globalAlpha = 1;

            for (let index = waves.length - 1; index >= 0; index -= 1) {
                const wave = waves[index];
                wave.age += delta;
                const progress = wave.age / wave.life;

                if (progress >= 1) {
                    waves.splice(index, 1);
                    continue;
                }

                const radius = wave.radius + progress * Math.min(canvasWidth, canvasHeight) * 0.12;
                const alpha = Math.sin(progress * Math.PI) * 0.94;
                heroMarkContext.strokeStyle = `rgba(255, 142, 83, ${alpha})`;
                heroMarkContext.lineWidth = 2 + (1 - progress) * 3.2;
                heroMarkContext.beginPath();
                heroMarkContext.ellipse(origin.x, origin.y, radius * 1.45, radius * 0.52, heroMarkEdgeAngle, 0, Math.PI * 2);
                heroMarkContext.stroke();
            }

            for (let index = particles.length - 1; index >= 0; index -= 1) {
                const particle = particles[index];
                particle.age += delta;
                const progress = particle.age / particle.life;

                if (progress >= 1) {
                    particles.splice(index, 1);
                    continue;
                }

                particle.x += particle.vx * delta;
                particle.y += particle.vy * delta;
                particle.vy += particle.gravity * delta;
                particle.vx *= 1 - particle.drag * delta;
                particle.angle += particle.spin * delta;

                const fadeIn = Math.min(particle.age * 12, 1);
                const fadeOut = Math.min((1 - progress) * 4, 1);
                const alpha = fadeIn * fadeOut;
                const trail = Math.min(32, Math.abs(particle.vx) * 0.24 + 8);

                heroMarkContext.save();
                heroMarkContext.translate(particle.x, particle.y);
                heroMarkContext.rotate(particle.angle);
                heroMarkContext.globalAlpha = alpha;
                heroMarkContext.shadowColor = `hsla(${particle.hue}, 92%, 66%, 0.95)`;
                heroMarkContext.shadowBlur = 10;
                heroMarkContext.strokeStyle = `hsla(${particle.hue}, 100%, 78%, ${alpha})`;
                heroMarkContext.lineWidth = particle.size * 0.95;
                heroMarkContext.beginPath();
                heroMarkContext.moveTo(-trail, 0);
                heroMarkContext.lineTo(0, 0);
                heroMarkContext.stroke();
                heroMarkContext.fillStyle = `hsla(${particle.hue}, 100%, 78%, ${alpha})`;
                heroMarkContext.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
                heroMarkContext.restore();
            }

            heroMarkContext.restore();
            window.requestAnimationFrame(drawHeroMarkCanvas);
        };

        resizeHeroMarkCanvas();
        window.addEventListener('resize', resizeHeroMarkCanvas, { passive: true });
        window.requestAnimationFrame(drawHeroMarkCanvas);
    }

    // Scroll reveal with stagger
    const revealElements = document.querySelectorAll('.reveal');
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const parent = entry.target.closest('.about__stats, .cases__grid, .clients__grid, .real-cases__grid, .products__grid, .process__timeline, .stack__grid');
                if (parent) {
                    const siblings = Array.from(parent.children).filter(child => child.classList.contains('reveal'));
                    const index = siblings.indexOf(entry.target);
                    entry.target.style.transitionDelay = `${index * 100}ms`;
                }
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => revealObserver.observe(el));

    // Hero intro: keep the ellipse in place, then write the title downward while the 3D mark reveals.
    const heroTitle = document.querySelector('.hero__title');
    const heroCursor = heroTitle?.querySelector('.hero__cursor');
    const typingParts = heroTitle
        ? Array.from(heroTitle.querySelectorAll('[data-text]'))
        : [];
    const heroLabel = document.querySelector('.hero__label');
    const heroSubtitle = document.querySelector('.hero__subtitle');
    const heroActions = document.querySelector('.hero__actions');

    const showHeroIntroItem = element => element?.classList.add('hero-intro__item--visible');

    if (heroTitle && heroCursor && typingParts.length) {
        const typePart = (partIndex = 0, charIndex = 0) => {
            const part = typingParts[partIndex];

            if (!part) {
                heroCursor.classList.add('hero__cursor--done');
                window.setTimeout(() => showHeroIntroItem(heroSubtitle), 360);
                window.setTimeout(() => showHeroIntroItem(heroActions), 820);
                return;
            }

            part.append(heroCursor);
            const text = part.dataset.text || '';

            if (charIndex < text.length) {
                part.insertBefore(document.createTextNode(text.charAt(charIndex)), heroCursor);
                window.setTimeout(() => typePart(partIndex, charIndex + 1), 52);
            } else {
                window.setTimeout(() => typePart(partIndex + 1, 0), 220);
            }
        };

        window.setTimeout(() => showHeroIntroItem(heroLabel), 850);
        window.setTimeout(() => {
            showHeroIntroItem(heroTitle);
            heroMark?.classList.add('hero__mark--revealing');
            beginHeroMarkReveal();
            typePart();
        }, 1_500);
    }

    // Form placeholder handler
    const form = document.querySelector('.contacts__form');
    if (form) {
        form.addEventListener('submit', e => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.textContent = 'Заявка отправлена';
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                form.reset();
            }, 3000);
        });
    }
})();
