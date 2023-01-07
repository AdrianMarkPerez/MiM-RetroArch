const mediump mat3 YIQ_to_RGB = mat3(1.0,     1.0,       1.0,
                                	 0.9563, -0.2721,   -1.1070,
                                     0.6210, -0.6474,    1.7046);
const mediump mat3 RGB_to_YIQ = mat3(0.299,   0.595716,  0.211456,
                                     0.587,  -0.274453, -0.522591,
                                     0.114,  -0.321263,  0.311135);

/** The Prep pass encodes halation into the alpha channel of an sRGB texture; this applies it to the final color. */
mediump vec3 DecodeColor(mediump vec4 color) {
	mediump vec3 color_yiq = color.rgb * RGB_to_YIQ;
	color_yiq.r = max(color_yiq.r, params.HALATION_SCALE * color.a / params.HALATION_BRIGHTNESS_FALLOFF);
	return color_yiq * YIQ_to_RGB;
}
