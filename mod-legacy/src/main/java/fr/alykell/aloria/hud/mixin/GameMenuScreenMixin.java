package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Bouton « Aloria HUD » dans le menu Échap, sous les autres boutons. */
@Mixin(GameMenuScreen.class)
public abstract class GameMenuScreenMixin extends Screen {
	private static final int BUTTON_ID = 4242;

	@Inject(method = "init", at = @At("TAIL"))
	private void aloriahud$addButton(CallbackInfo ci) {
		int bottom = height / 2;
		for (ButtonWidget b : buttons) bottom = Math.max(bottom, b.y + 20);
		buttons.add(new ButtonWidget(BUTTON_ID, width / 2 - 100, Math.min(bottom + 8, height - 24), 200, 20, "Aloria HUD"));
	}

	@Inject(method = "buttonClicked", at = @At("HEAD"), cancellable = true)
	private void aloriahud$click(ButtonWidget button, CallbackInfo ci) {
		if (button.id != BUTTON_ID) return;
		client.setScreen(new HudMenuScreen(this));
		ci.cancel();
	}
}
