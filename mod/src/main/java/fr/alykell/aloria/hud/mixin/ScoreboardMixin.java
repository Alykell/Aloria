package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Tableau des scores déplacé et agrandi (élément du jeu « Scoreboard »). */
//#if MC >= 260000
@Mixin(Hud.class)
//#else
//$$ @Mixin(Gui.class)
//#endif
public class ScoreboardMixin {
	@Inject(method = "displayScoreboardSidebar", at = @At("HEAD"))
	private void aloriahud$moveSidebar(CallbackInfo ci, @Local(argsOnly = true) GuiGraphicsExtractor graphics) {
		GameElements.begin(graphics, "scoreboard");
	}

	@Inject(method = "displayScoreboardSidebar", at = @At("TAIL"))
	private void aloriahud$restoreSidebar(CallbackInfo ci, @Local(argsOnly = true) GuiGraphicsExtractor graphics) {
		GameElements.end(graphics);
	}
}
