package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 260000
//$$ import net.minecraft.client.Camera;
//$$ import org.spongepowered.asm.mixin.gen.Invoker;
//#endif

/** 1.21.x : FOV réel du jeu (effets compris), pour placer le chrono d'explosion au-dessus des entités. Vide en 26.x. */
@Mixin(GameRenderer.class)
public interface GameRendererAccessor {
	//#if MC < 260000
	//$$ @Invoker("getFov")
	//$$ float invokeGetFov(Camera camera, float partialTick, boolean useFovSetting);
	//#endif
}
