package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.GuiNewChat;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Chat déplacé et agrandi (élément du jeu) ; la souris est ramenée à sa place habituelle pour les clics. */
@Mixin(GuiNewChat.class)
public class ChatMoveMixin {
	@Inject(method = "drawChat", at = @At("HEAD"), require = 0)
	private void aloriahud$moveChat(int updateCounter, CallbackInfo ci) {
		GameElements.beginChat();
	}

	@Inject(method = "drawChat", at = @At("TAIL"), require = 0)
	private void aloriahud$restoreChat(int updateCounter, CallbackInfo ci) {
		GameElements.end();
	}

	@ModifyVariable(method = "getChatComponent", at = @At("HEAD"), argsOnly = true, ordinal = 0, require = 0)
	private int aloriahud$chatMouseX(int x) {
		return GameElements.chatMouseX(x);
	}

	@ModifyVariable(method = "getChatComponent", at = @At("HEAD"), argsOnly = true, ordinal = 1, require = 0)
	private int aloriahud$chatMouseY(int y) {
		return GameElements.chatMouseY(y);
	}
}
