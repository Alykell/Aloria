package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;

import java.util.ArrayList;
import java.util.List;

/** Armure portée et objet en main, avec la durabilité restante (1.8.9 : seulement ce qui est équipé). */
public final class ArmorModule extends HudModule {
	private static final int ROW = 17;
	private static final int PAD = 3;

	public ArmorModule() {
		super("armor");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 1f, 0.45f);
	}

	@Override
	public String category() {
		return "pvp";
	}

	@Override
	public boolean hasContent(MinecraftClient mc) {
		return !stacks(mc, false).isEmpty();
	}

	private static List<ItemStack> stacks(MinecraftClient mc, boolean preview) {
		List<ItemStack> list = new ArrayList<>();
		if (mc.player != null) {
			// armor[3] = casque … armor[0] = bottes
			for (int i = 3; i >= 0; i--) {
				ItemStack stack = mc.player.inventory.armor[i];
				if (stack != null) list.add(stack);
			}
			ItemStack hand = mc.player.getMainHandStack();
			if (hand != null) list.add(hand);
		}
		if (list.isEmpty() && preview) {
			list.add(new ItemStack(Items.DIAMOND_HELMET));
			list.add(new ItemStack(Items.DIAMOND_CHESTPLATE));
			list.add(new ItemStack(Items.IRON_LEGGINGS));
			list.add(new ItemStack(Items.IRON_BOOTS));
		}
		return list;
	}

	private static String label(ItemStack stack) {
		if (stack.isDamageable()) return String.valueOf(stack.getMaxDamage() - stack.getDamage());
		return stack.count > 1 ? String.valueOf(stack.count) : "";
	}

	/** Vert → jaune → rouge selon l'usure */
	private static int durabilityColor(ItemStack stack, int fallback) {
		if (!stack.isDamageable()) return fallback;
		float ratio = 1f - (float) stack.getDamage() / stack.getMaxDamage();
		if (ratio > 0.5f) return 0xFF7BE495;
		if (ratio > 0.2f) return 0xFFFFD166;
		return 0xFFFF6B6B;
	}

	@Override
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		int text = 0;
		for (ItemStack stack : stacks(mc, preview)) text = Math.max(text, g.textWidth(label(stack)));
		return PAD * 2 + 16 + (text > 0 ? text + 5 : 0);
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return Math.max(1, stacks(mc, preview).size()) * ROW - 1 + PAD * 2;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		Draw.panel(g, 0, 0, width(mc, g, s, preview), height(mc, g, s, preview), s);
		int y = PAD;
		for (ItemStack stack : stacks(mc, preview)) {
			g.item(stack, PAD, y);
			String label = label(stack);
			if (!label.isEmpty()) g.text(label, PAD + 21, y + 4, durabilityColor(stack, Draw.textColor(s)), s.shadow);
			y += ROW;
		}
	}
}
