import mongoose from 'mongoose';
import { LIMITS, slugify } from '../shared/rules.js';

const SLUG = /^[a-z0-9-]+$/;

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: LIMITS.tagName[0], maxlength: LIMITS.tagName[1] },
  slug: { type: String, required: true, match: SLUG },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: LIMITS.categoryName[0], maxlength: LIMITS.categoryName[1] },
  slug: { type: String, required: true, match: SLUG },
  tags: { type: [tagSchema], default: [] },
}, { versionKey: false });

categorySchema.index({ slug: 1 }, { unique: true });

// El slug se deriva del nombre si no viene
tagSchema.pre('validate', function setSlug() { if (!this.slug && this.name) this.slug = slugify(this.name); });
categorySchema.pre('validate', function setSlug() { if (!this.slug && this.name) this.slug = slugify(this.name); });

categorySchema.methods.toRef = function toRef() {
  return { categoryId: this._id, name: this.name, slug: this.slug };
};

categorySchema.methods.toPublic = function toPublic() {
  return {
    categoryId: String(this._id), name: this.name, slug: this.slug,
    tags: this.tags.map((t) => ({ tagId: String(t._id), name: t.name, slug: t.slug })),
  };
};

export const Category = mongoose.model('Category', categorySchema);
