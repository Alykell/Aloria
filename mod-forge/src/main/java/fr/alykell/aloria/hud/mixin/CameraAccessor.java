package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.renderer.ActiveRenderInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.nio.FloatBuffer;
import java.nio.IntBuffer;

/** Matrices du rendu du monde, gardées par la caméra à chaque image : pour placer le chrono au-dessus des entités. */
@Mixin(ActiveRenderInfo.class)
public interface CameraAccessor {
	@Accessor("MODELVIEW")
	static FloatBuffer getModelMatrix() {
		throw new AssertionError();
	}

	@Accessor("PROJECTION")
	static FloatBuffer getProjectionMatrix() {
		throw new AssertionError();
	}

	@Accessor("VIEWPORT")
	static IntBuffer getViewport() {
		throw new AssertionError();
	}
}
