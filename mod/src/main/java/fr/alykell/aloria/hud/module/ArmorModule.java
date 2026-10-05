package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;

/** Armure portée et objet en main, avec la durabilité restante. */
public final class ArmorModule extends HudModule {
	private static final EquipmentSlot[] SLOTS = {
		EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND
	};
	private static final int ROW = 17;

	public ArmorModule() {
		super("armor", "Armure");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 1f, 0.45f);
	}

	private static List<ItemStack> items(Minecraft mc, boolean preview) {
		List<ItemStack> list = new ArrayList<>();
		if (mc.player != null) {
			for (EquipmentSlot slot : SLOTS) {
				ItemStack stack = mc.player.getItemBySlot(slot);
				if (!stack.isEmpty()) list.add(stack);
			}
		}
		if (list.isEmpty() && preview) {
			list.add(new ItemStack(Items.DIAMOND_HELMET));
			list.add(new ItemStack(Items.DIAMOND_CHESTPLATE));
			list.add(new ItemStack(Items.DIAMOND_LEGGINGS));
			list.add(new ItemStack(Items.DIAMOND_BOOTS));
			list.add(new ItemStack(Items.DIAMOND_SWORD));
		}
		return list;
	}

	private static String label(ItemStack stack) {
		if (stack.isDamageableItem()) return String.valueOf(stack.getMaxDamage() - stack.getDamageValue());
		return stack.getCount() > 1 ? String.valueOf(stack.getCount()) : "";
	}

	/** Vert → jaune → rouge selon l'usure */
	private static int durabilityColor(ItemStack stack, int fallback) {
		if (!stack.isDamageableItem()) return fallback;
		float ratio = 1f - (float) stack.getDamageValue() / stack.getMaxDamage();
		if (ratio > 0.5f) return 0xFF7BE495;
		if (ratio > 0.2f) return 0xFFFFD166;
		return 0xFFFF6B6B;
	}

	@Override
	public String category() {
		return "pvp";
	}

	@Override
	public boolean hasContent(Minecraft mc) {
		return !items(mc, false).isEmpty();
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		int text = 0;
		for (ItemStack stack : items(mc, preview)) text = Math.max(text, mc.font.width(label(stack)));
		return 16 + (text > 0 ? text + 6 : 0) + 4;
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return Math.max(1, items(mc, preview).size()) * ROW + 3;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		if (s.background) g.fill(0, 0, width(mc, s, preview), height(mc, s, preview), Theme.HUD_BG);
		int y = 2;
		for (ItemStack stack : items(mc, preview)) {
			g.item(stack, 2, y);
			String label = label(stack);
			if (!label.isEmpty()) g.text(mc.font, label, 22, y + 4, durabilityColor(stack, s.color), s.shadow);
			y += ROW;
		}
	}
}
