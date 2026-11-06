package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.BossHealthOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Barres de boss déplacées et agrandies (élément du jeu « Barres de boss »). */
@Mixin(BossHealthOverlay.class)
public class BossBarMixin {
	@Inject(method = "extractRenderState", at = @At("HEAD"))
	private void aloriahud$moveBossBars(GuiGraphicsExtractor graphics, CallbackInfo ci) {
		GameElements.begin(graphics, "bossbar");
	}

	@Inject(method = "extractRenderState", at = @At("TAIL"))
	private void aloriahud$restoreBossBars(GuiGraphicsExtractor graphics, CallbackInfo ci) {
		GameElements.end(graphics);
	}
}
